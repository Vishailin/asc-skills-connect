// ASC Skills Connect — Employer / TSP / Funder API
// Real queries against learner_search_view / tsp_candidate_view (from the
// learner_registration_database schema) plus the opportunities/applications
// tables added in 002_employer_search.sql, and now JWT auth + RBAC (005_auth.sql).

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const storage = require("./storage");
const verifier = require("./verifier");

// All of these fall back to the same local-dev defaults the earlier
// modules hardcoded, so `node server.js` still works with zero setup —
// but every value is now overridable via env vars (or a .env file, see
// .env.example) instead of only being editable by changing this file.
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "learner_registration_database",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

if (!process.env.JWT_SECRET) {
  console.warn("[server] JWT_SECRET not set — using an insecure dev-only default. Set it in .env before deploying anywhere real.");
}
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret-do-not-use-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

// Comma-separated list of allowed frontend origins. Falls back to the
// Vite dev scaffold's own origin so local dev keeps working with zero
// config — but that default is not a real domain, so it's called out
// the same way the JWT_SECRET default is.
if (!process.env.CORS_ORIGIN) {
  console.warn("[server] CORS_ORIGIN not set — allowing only http://localhost:5173 (the dev scaffold). Set it to the real frontend domain before deploying anywhere real.");
}
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(cors({
  // No Origin header (curl, server-to-server, same-origin) is always
  // allowed — only cross-origin browser requests are restricted.
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
    const err = new Error(`Origin ${origin} is not allowed by CORS`);
    err.corsRejected = true;
    callback(err);
  },
}));
app.use(express.json());

// =======================================================================
// Auth — login, JWT verification, role/ownership guards.
// Every route below except /api/health and /api/auth/login now requires
// a bearer token. RBAC has two layers: requireRole checks the token's
// role (employer/tsp/funder), and the per-route ownership checks make
// sure that role can only read/write its own organisation's data —
// admin bypasses both, per the spec's "Admin: Full access, audit-logged".
// =======================================================================

const PROFILE_TABLE_BY_ROLE = { employer: "employer_profiles", tsp: "tsp_profiles", funder: "funder_profiles", learner: "learner_profiles" };

async function getProfileId(user) {
  const table = PROFILE_TABLE_BY_ROLE[user.role];
  if (!table) return null; // admin has no profile row
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE user_id = $1`, [user.id]);
  return rows[0]?.id ?? null;
}

// Async on purpose: checks the user's current status on every request
// (one indexed PK lookup) rather than only at login, so a suspension
// takes effect immediately instead of waiting out the token's remaining
// JWT_EXPIRES_IN — the whole point of a suspend feature is that it's
// urgent. Express 5 awaits async middleware natively.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    const { rows } = await pool.query("SELECT status FROM users WHERE id = $1", [req.auth.sub]);
    if (rows.length === 0 || rows[0].status === "suspended") {
      return res.status(403).json({ error: "This account has been suspended" });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify account status" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.auth.role !== role && req.auth.role !== "admin") {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}

// For list endpoints keyed off a ?xxx_id= query param: a non-admin is
// always locked to their own profile id, regardless of what (if
// anything) they passed in the query string. Admins may query any
// organisation's data, or omit the param to see all of them.
function resolveScopeId(req, queryParamValue) {
  if (req.auth.role === "admin") return queryParamValue || null;
  return req.auth.profileId;
}

// For detail routes where the id in the URL is an opportunity id, not
// a profile id — call after fetching the opportunity row.
function assertOwnsOpportunity(req, res, opp, posterField) {
  if (req.auth.role === "admin") return true;
  if (opp[posterField] !== req.auth.profileId) {
    res.status(403).json({ error: "Cannot access another organisation's opportunity" });
    return false;
  }
  return true;
}

// POPIA audit trail (spec section 7) — scoped to the endpoints that
// actually expose learner-identifying data to an employer/TSP.
async function logAccess(req, action, targetType, targetId) {
  try {
    await pool.query(
      `INSERT INTO access_audit_log (actor_user_id, actor_role, action, target_type, target_id) VALUES ($1, $2, $3, $4, $5)`,
      [req.auth.sub, req.auth.role, action, targetType, targetId]
    );
  } catch (err) {
    console.error("audit log write failed (non-fatal):", err);
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts — try again later" },
});

// POST /api/auth/login   body: { email, password }
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ error: "This account has been suspended" });
    }
    const profileId = await getProfileId(user);
    const token = jwt.sign({ sub: user.id, role: user.role, profileId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, role: user.role, profileId, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me — lets a dashboard confirm/restore who's logged in.
app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ userId: req.auth.sub, role: req.auth.role, profileId: req.auth.profileId });
});

// =======================================================================
// Learner registration (spec 5.1) — the 7-step wizard's actual backend.
// The schema (migrations/001_schema.sql) was built to match this wizard
// from day one; this is the first code that actually writes through it
// end to end. One transaction across 6 tables, so a failure partway
// through (e.g. a duplicate email) never leaves an orphaned user row.
// =======================================================================

const GENDER_VALUES = ["Female", "Male", "Non-binary", "Prefer not to say"];
const EMPLOYMENT_STATUS_VALUES = ["Unemployed", "Employed", "Self-Employed"];
const WORK_EXPERIENCE_VALUES = ["No Experience", "Less than 1 Year", "1-2 Years", "3-5 Years", "5+ Years"];
const QUALIFICATION_VALUES = ["Grade 10", "Grade 11", "Matric", "Certificate", "Diploma", "Degree", "Postgraduate"];

// The exact wording shown to the learner at consent time — stored
// verbatim per consent_records row, per POPIA (see schema design notes:
// "Consent is an append-only log, not just a checkbox").
const CONSENT_TEXT =
  "I consent to ASC Skills Connect storing my personal information and using it to match me with " +
  "learnerships, internships, apprenticeships, skills programmes, bursaries, and employment opportunities, " +
  "subject to the visibility settings I've chosen below. I understand I can withdraw this consent at any time.";

// GET /api/career-fields, GET /api/funders — public reference data the
// registration wizard's Career Interests and Funded Programme History
// steps need to populate real options from, not hardcoded lists.
app.get("/api/career-fields", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name FROM career_fields ORDER BY name");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load career fields" });
  }
});

app.get("/api/funders", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, is_seta FROM funders ORDER BY name");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load funders" });
  }
});

// POST /api/auth/register-learner
app.post("/api/auth/register-learner", loginLimiter, async (req, res) => {
  const {
    email, mobile, password,
    full_name, surname, id_number, date_of_birth, gender, disability_status, province, municipality,
    highest_qualification, field_of_study, institution, year_completed,
    employment_status, work_experience,
    career_interest_ids,
    funded_programme_history,
    visible_to_employers, visible_to_tsps, visible_to_funders,
    consent_accepted,
  } = req.body || {};

  const missing = ["email", "mobile", "password", "full_name", "surname", "id_number", "date_of_birth", "gender", "province", "municipality"]
    .filter((field) => !req.body?.[field]);
  if (missing.length > 0) return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
  if (!/^0\d{9}$/.test(mobile)) return res.status(400).json({ error: "mobile must be a 10-digit SA number starting with 0" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });
  if (!GENDER_VALUES.includes(gender)) return res.status(400).json({ error: `gender must be one of: ${GENDER_VALUES.join(", ")}` });
  if (highest_qualification && !QUALIFICATION_VALUES.includes(highest_qualification)) {
    return res.status(400).json({ error: `highest_qualification must be one of: ${QUALIFICATION_VALUES.join(", ")}` });
  }
  if (employment_status && !EMPLOYMENT_STATUS_VALUES.includes(employment_status)) {
    return res.status(400).json({ error: `employment_status must be one of: ${EMPLOYMENT_STATUS_VALUES.join(", ")}` });
  }
  if (work_experience && !WORK_EXPERIENCE_VALUES.includes(work_experience)) {
    return res.status(400).json({ error: `work_experience must be one of: ${WORK_EXPERIENCE_VALUES.join(", ")}` });
  }
  if (!verifier.isValidSaIdChecksum(id_number)) {
    return res.status(400).json({ error: "id_number fails the standard SA ID checksum — please check the number and try again" });
  }
  if (!consent_accepted) return res.status(400).json({ error: "consent_accepted is required to register" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: userRows } = await client.query(
      `INSERT INTO users (role, email, mobile, password_hash) VALUES ('learner', $1, $2, $3) RETURNING id`,
      [email, mobile, await bcrypt.hash(password, 10)]
    );
    const userId = userRows[0].id;

    const { rows: profileRows } = await client.query(
      `INSERT INTO learner_profiles
         (user_id, full_name, surname, id_number, date_of_birth, gender, disability_status, province, municipality,
          employment_status, work_experience, highest_qualification, field_of_study, institution, year_completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        userId, full_name, surname, id_number, date_of_birth, gender, disability_status || null, province, municipality,
        employment_status || "Unemployed", work_experience || "No Experience",
        highest_qualification || "Matric", field_of_study || null, institution || null, year_completed || null,
      ]
    );
    const learnerId = profileRows[0].id;

    for (const fieldId of career_interest_ids || []) {
      await client.query(`INSERT INTO learner_career_interests (learner_id, field_id) VALUES ($1, $2)`, [learnerId, fieldId]);
    }

    // "No prior funded programmes" needs no flag — an empty array here
    // just means zero rows, per the schema's design notes.
    for (const programme of funded_programme_history || []) {
      await client.query(
        `INSERT INTO learner_funded_programme_history (learner_id, programme_name, funder_id, programme_year, outcome, led_to_employment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [learnerId, programme.programme_name, programme.funder_id || null, programme.programme_year || null,
          programme.outcome || "Completed", !!programme.led_to_employment]
      );
    }

    await client.query(
      `INSERT INTO learner_visibility_settings (learner_id, visible_to_employers, visible_to_tsps, visible_to_funders)
       VALUES ($1, $2, $3, $4)`,
      [learnerId, visible_to_employers !== false, visible_to_tsps !== false, !!visible_to_funders]
    );

    await client.query(`INSERT INTO consent_records (user_id, consent_text) VALUES ($1, $2)`, [userId, CONSENT_TEXT]);

    // Write-once, admin/vendor-owned: registration only ever creates
    // 'pending' rows — nothing here (or anywhere else a learner can
    // reach) ever writes 'verified'.
    await client.query(
      `INSERT INTO verification_records (learner_id, record_type, status) VALUES ($1, 'id', 'pending'), ($1, 'qualification', 'pending')`,
      [learnerId]
    );

    await client.query("COMMIT");

    const token = jwt.sign({ sub: userId, role: "learner", profileId: learnerId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, role: "learner", profileId: learnerId, email });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") { // unique_violation — email, mobile, or id_number already registered
      return res.status(409).json({ error: `That ${err.constraint?.includes("email") ? "email" : err.constraint?.includes("mobile") ? "mobile number" : "ID number"} is already registered` });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    client.release();
  }
});

// GET /api/learner/:id/passport — the Digital Skills Passport (spec 5.2):
// verification badges, education, career interests, documents, and
// funded-programme history in one place. What the Review step of the
// registration wizard shows back, and what a learner would revisit later.
app.get("/api/learner/:id/passport", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another learner's passport" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT lp.*, lvs.visible_to_employers, lvs.visible_to_tsps, lvs.visible_to_funders,
              (SELECT status FROM verification_records vr WHERE vr.learner_id = lp.id AND vr.record_type = 'id' ORDER BY created_at DESC LIMIT 1) AS id_verification_status,
              (SELECT status FROM verification_records vr WHERE vr.learner_id = lp.id AND vr.record_type = 'qualification' ORDER BY created_at DESC LIMIT 1) AS qualification_verification_status,
              (SELECT array_agg(cf.name) FROM learner_career_interests lci JOIN career_fields cf ON cf.id = lci.field_id WHERE lci.learner_id = lp.id) AS career_interests
       FROM learner_profiles lp
       JOIN learner_visibility_settings lvs ON lvs.learner_id = lp.id
       WHERE lp.id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Learner not found" });

    const { rows: documents } = await pool.query(
      "SELECT id, document_type, verification_status, uploaded_at FROM learner_documents WHERE learner_id = $1 ORDER BY uploaded_at DESC",
      [id]
    );
    const { rows: fundedHistory } = await pool.query(
      `SELECT h.programme_name, h.programme_year, h.outcome, h.led_to_employment, f.name AS funder_name
       FROM learner_funded_programme_history h LEFT JOIN funders f ON f.id = h.funder_id
       WHERE h.learner_id = $1 ORDER BY h.programme_year DESC NULLS LAST`,
      [id]
    );

    res.json({ ...rows[0], documents, funded_programme_history: fundedHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load passport" });
  }
});

// =======================================================================
// Learner-initiated browsing & application. Until now, an applications
// row only ever existed because the background worker auto-matched a
// learner, or an employer/TSP shortlisted one — a learner had no way to
// act on their own behalf. Uses the exact same 4-criteria scoring
// formula as every other scoring endpoint in this file (worker.js,
// employer/tsp/funder candidate views) for consistency: a learner's
// self-view of their score must match what a poster would see for them.
// That also means it inherits the same NULL-requirement quirk those all
// share (an unset req_* field scores 0 on that criterion rather than
// "any" matching) — not fixed here, since fixing it would mean touching
// every scoring query in the codebase at once, not just this one.
// =======================================================================

// GET /api/learner/:id/opportunities?opportunity_type=&province=
// Every open opportunity, scored against this learner's own profile.
app.get("/api/learner/:id/opportunities", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot browse opportunities as another learner" });
  }
  const { opportunity_type: filterType, province: filterProvince } = req.query;
  try {
    const learnerResult = await pool.query(
      `SELECT province, EXTRACT(YEAR FROM age(date_of_birth))::INT AS age, employment_status, highest_qualification
       FROM learner_profiles WHERE id = $1`,
      [id]
    );
    if (learnerResult.rows.length === 0) return res.status(404).json({ error: "Learner not found" });
    const learner = learnerResult.rows[0];

    const params = [learner.province, learner.age, learner.employment_status, learner.highest_qualification, id];
    let extraFilters = "";
    if (filterType) { params.push(filterType); extraFilters += ` AND o.opportunity_type = $${params.length}`; }
    if (filterProvince) { params.push(filterProvince); extraFilters += ` AND o.req_province = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT o.id, o.title, o.opportunity_type, o.funding_source,
              o.req_province, o.req_age_min, o.req_age_max, o.req_employment_status, o.req_qualification_min,
              COALESCE(e.company_name, t.organisation_name, f.organisation_name) AS poster_name,
              CASE WHEN o.employer_id IS NOT NULL THEN 'employer' WHEN o.tsp_id IS NOT NULL THEN 'tsp' ELSE 'funder' END AS poster_type,
              a.status AS application_status,
              (  (CASE WHEN o.req_province = $1 THEN 25 ELSE 0 END)
               + (CASE WHEN $2 BETWEEN o.req_age_min AND o.req_age_max THEN 25 ELSE 0 END)
               + (CASE WHEN o.req_employment_status = $3 THEN 25 ELSE 0 END)
               + (CASE WHEN $4::qualification_type >= o.req_qualification_min THEN 25 ELSE 0 END)
              ) AS total_score
       FROM opportunities o
       LEFT JOIN employer_profiles e ON e.id = o.employer_id
       LEFT JOIN tsp_profiles t ON t.id = o.tsp_id
       LEFT JOIN funder_profiles f ON f.id = o.funder_id
       LEFT JOIN applications a ON a.opportunity_id = o.id AND a.learner_id = $5
       WHERE o.status = 'open'
       ${extraFilters}
       ORDER BY total_score DESC, o.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load opportunities" });
  }
});

// POST /api/learner/opportunities/:id/apply
// Idempotent — applying to something already matched/applied just
// returns the existing application rather than erroring.
app.post("/api/learner/opportunities/:id/apply", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  const learnerId = req.auth.role === "admin" ? req.body?.learner_id : req.auth.profileId;
  if (!learnerId) return res.status(400).json({ error: "learner_id is required" });
  try {
    const scoredResult = await pool.query(
      `SELECT o.id,
              (  (CASE WHEN o.req_province = lp.province THEN 25 ELSE 0 END)
               + (CASE WHEN EXTRACT(YEAR FROM age(lp.date_of_birth))::INT BETWEEN o.req_age_min AND o.req_age_max THEN 25 ELSE 0 END)
               + (CASE WHEN o.req_employment_status = lp.employment_status THEN 25 ELSE 0 END)
               + (CASE WHEN lp.highest_qualification >= o.req_qualification_min THEN 25 ELSE 0 END)
              ) AS score
       FROM opportunities o, learner_profiles lp
       WHERE o.id = $1 AND lp.id = $2 AND o.status = 'open'`,
      [id, learnerId]
    );
    if (scoredResult.rows.length === 0) return res.status(404).json({ error: "Opportunity not found or no longer open" });
    const score = scoredResult.rows[0].score;

    const { rows } = await pool.query(
      `INSERT INTO applications (learner_id, opportunity_id, eligibility_score, status)
       VALUES ($1, $2, $3, 'matched')
       ON CONFLICT (learner_id, opportunity_id) DO NOTHING
       RETURNING *`,
      [learnerId, id, score]
    );
    if (rows.length === 0) {
      const existing = await pool.query("SELECT * FROM applications WHERE learner_id = $1 AND opportunity_id = $2", [learnerId, id]);
      return res.json({ ...existing.rows[0], already_applied: true });
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply" });
  }
});

// POST /api/learner/opportunities/:id/withdraw
app.post("/api/learner/opportunities/:id/withdraw", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  const learnerId = req.auth.role === "admin" ? req.body?.learner_id : req.auth.profileId;
  if (!learnerId) return res.status(400).json({ error: "learner_id is required" });
  try {
    const { rows } = await pool.query(
      `UPDATE applications SET status = 'withdrawn', updated_at = now() WHERE learner_id = $1 AND opportunity_id = $2 RETURNING *`,
      [learnerId, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "No application found for this opportunity" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to withdraw" });
  }
});

// =======================================================================
// Opportunity creation — shared across all 3 poster types (employer/tsp/
// funder). The poster's own id always comes from the auth token, never
// the request body, so nobody can post an opportunity under another
// organisation's name. Creating one fires 006_matching_job.sql's INSERT
// trigger for free, so worker.js auto-scores it against every visible
// learner the moment it's created — no extra integration code needed
// here for that.
// =======================================================================

const OPPORTUNITY_TYPE_VALUES = ["Learnership", "Internship", "Apprenticeship", "Employment", "Skills Programme", "Bursary"];

function validateOpportunityInput(body) {
  const { title, opportunity_type, req_employment_status, req_qualification_min, match_threshold } = body || {};
  if (!title) return "title is required";
  if (!OPPORTUNITY_TYPE_VALUES.includes(opportunity_type)) return `opportunity_type must be one of: ${OPPORTUNITY_TYPE_VALUES.join(", ")}`;
  if (req_employment_status && !EMPLOYMENT_STATUS_VALUES.includes(req_employment_status)) return `req_employment_status must be one of: ${EMPLOYMENT_STATUS_VALUES.join(", ")}`;
  if (req_qualification_min && !QUALIFICATION_VALUES.includes(req_qualification_min)) return `req_qualification_min must be one of: ${QUALIFICATION_VALUES.join(", ")}`;
  if (match_threshold !== undefined && (match_threshold < 0 || match_threshold > 100)) return "match_threshold must be between 0 and 100";
  return null;
}

async function createOpportunity(posterField, posterId, body) {
  const { title, opportunity_type, funding_source, req_province, req_age_min, req_age_max, req_employment_status, req_qualification_min, match_threshold } = body;
  const { rows } = await pool.query(
    `INSERT INTO opportunities (${posterField}, title, opportunity_type, funding_source, req_province, req_age_min, req_age_max, req_employment_status, req_qualification_min, match_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 50))
     RETURNING *`,
    [posterId, title, opportunity_type, funding_source || null, req_province || null, req_age_min || null, req_age_max || null, req_employment_status || null, req_qualification_min || null, match_threshold]
  );
  return rows[0];
}

// PATCH /api/opportunities/:id   body: { status?, match_threshold? }
// One shared route for all 3 poster types — ownership is checked against
// whichever of employer_id/tsp_id/funder_id is actually set on the row.
const VALID_OPPORTUNITY_STATUSES = ["open", "closed"];
app.patch("/api/opportunities/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { status, match_threshold } = req.body || {};
  if (status !== undefined && !VALID_OPPORTUNITY_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_OPPORTUNITY_STATUSES.join(", ")}` });
  }
  if (match_threshold !== undefined && (match_threshold < 0 || match_threshold > 100)) {
    return res.status(400).json({ error: "match_threshold must be between 0 and 100" });
  }
  try {
    const { rows: oppRows } = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (oppRows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    const opp = oppRows[0];
    const posterField = opp.employer_id ? "employer_id" : opp.tsp_id ? "tsp_id" : "funder_id";
    // NOTE: previously excluded 'admin' here by mistake — this check ran
    // before assertOwnsOpportunity's admin bypass ever got a chance to
    // apply, so admin could never PATCH any opportunity. Found while
    // building the equivalent TSP placement routes below.
    if (!["employer", "tsp", "funder", "admin"].includes(req.auth.role)) return res.status(403).json({ error: "Only a poster or admin can update an opportunity" });
    if (!assertOwnsOpportunity(req, res, opp, posterField)) return;

    const { rows } = await pool.query(
      `UPDATE opportunities SET status = COALESCE($1, status), match_threshold = COALESCE($2, match_threshold) WHERE id = $3 RETURNING *`,
      [status || null, match_threshold ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update opportunity" });
  }
});

// ---------------------------------------------------------------------
// GET /api/opportunities?employer_id=...
// List opportunities, scoped to the authenticated employer (or any
// employer, for admin).
// ---------------------------------------------------------------------
app.get("/api/opportunities", authenticate, requireRole("employer"), async (req, res) => {
  const employerId = resolveScopeId(req, req.query.employer_id);
  try {
    const params = [];
    let where = "";
    if (employerId) {
      params.push(employerId);
      where = "WHERE o.employer_id = $1";
    }
    const { rows } = await pool.query(
      `SELECT o.id, o.title, o.opportunity_type, o.funding_source, o.status,
              o.req_province, o.req_age_min, o.req_age_max, o.req_employment_status, o.req_qualification_min,
              e.company_name AS employer_name,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id) AS matched_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'shortlisted') AS shortlisted_count
       FROM opportunities o
       JOIN employer_profiles e ON e.id = o.employer_id
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load opportunities" });
  }
});

// POST /api/opportunities
app.post("/api/opportunities", authenticate, requireRole("employer"), async (req, res) => {
  const validationError = validateOpportunityInput(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const employerId = req.auth.role === "admin" ? req.body.employer_id : req.auth.profileId;
  if (!employerId) return res.status(400).json({ error: "employer_id is required" });
  try {
    const opp = await createOpportunity("employer_id", employerId, req.body);
    res.status(201).json(opp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create opportunity" });
  }
});

// ---------------------------------------------------------------------
// GET /api/opportunities/:id/candidates
// The core "wired to learner_search_view" query: scores and ranks every
// visible learner against this opportunity's eligibility criteria.
// ---------------------------------------------------------------------
app.get("/api/opportunities/:id/candidates", authenticate, requireRole("employer"), async (req, res) => {
  const { id } = req.params;
  const { province: filterProvince, qualification: filterQual } = req.query;

  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    const opp = oppResult.rows[0];
    if (!assertOwnsOpportunity(req, res, opp, "employer_id")) return;

    const params = [opp.req_province, opp.req_age_min, opp.req_age_max, opp.req_employment_status, opp.req_qualification_min, id];
    let extraFilters = "";
    if (filterProvince) { params.push(filterProvince); extraFilters += ` AND lsv.province = $${params.length}`; }
    if (filterQual) { params.push(filterQual); extraFilters += ` AND lsv.highest_qualification = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT
         lsv.learner_id, lsv.full_name, lsv.surname, lsv.province, lsv.municipality,
         lsv.highest_qualification, lsv.employment_status, lsv.work_experience,
         lsv.availability_status, lsv.age, lsv.id_verification_status,
         lsv.qualification_verification_status, lsv.career_interests,
         a.status AS application_status,
         (CASE WHEN lsv.province = $1 THEN 25 ELSE 0 END) AS score_province,
         (CASE WHEN lsv.age BETWEEN $2 AND $3 THEN 25 ELSE 0 END) AS score_age,
         (CASE WHEN lsv.employment_status = $4 THEN 25 ELSE 0 END) AS score_employment,
         (CASE WHEN lsv.highest_qualification >= $5::qualification_type THEN 25 ELSE 0 END) AS score_qualification,
         (  (CASE WHEN lsv.province = $1 THEN 25 ELSE 0 END)
          + (CASE WHEN lsv.age BETWEEN $2 AND $3 THEN 25 ELSE 0 END)
          + (CASE WHEN lsv.employment_status = $4 THEN 25 ELSE 0 END)
          + (CASE WHEN lsv.highest_qualification >= $5::qualification_type THEN 25 ELSE 0 END)
         ) AS total_score
       FROM learner_search_view lsv
       LEFT JOIN applications a ON a.learner_id = lsv.learner_id AND a.opportunity_id = $6
       WHERE lsv.visible_to_employers = TRUE
       ${extraFilters}
       ORDER BY total_score DESC, lsv.full_name ASC`,
      params
    );

    await logAccess(req, "view_candidates", "opportunity", id);
    res.json({ opportunity: opp, candidates: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to score candidates" });
  }
});

// ---------------------------------------------------------------------
// POST /api/opportunities/:id/shortlist   body: { learner_id, score }
// Upserts an application row — creates it as 'matched' if it doesn't
// exist yet, then moves it to 'shortlisted'.
// ---------------------------------------------------------------------
app.post("/api/opportunities/:id/shortlist", authenticate, requireRole("employer"), async (req, res) => {
  const { id } = req.params;
  const { learner_id, score } = req.body;
  if (!learner_id || score === undefined) return res.status(400).json({ error: "learner_id and score are required" });

  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    if (!assertOwnsOpportunity(req, res, oppResult.rows[0], "employer_id")) return;

    const { rows } = await pool.query(
      `INSERT INTO applications (learner_id, opportunity_id, eligibility_score, status)
       VALUES ($1, $2, $3, 'shortlisted')
       ON CONFLICT (learner_id, opportunity_id)
       DO UPDATE SET status = 'shortlisted', updated_at = now()
       RETURNING *`,
      [learner_id, id, score]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to shortlist candidate" });
  }
});

// ---------------------------------------------------------------------
// GET /api/employers/:id/dashboard
// Aggregate stats for the employer's own dashboard.
// ---------------------------------------------------------------------
app.get("/api/employers/:id/dashboard", authenticate, requireRole("employer"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another organisation's dashboard" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM opportunities WHERE employer_id = $1) AS opportunities_posted,
         (SELECT count(*) FROM opportunities WHERE employer_id = $1 AND status = 'open') AS opportunities_open,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.employer_id = $1) AS total_matches,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.employer_id = $1 AND a.status = 'shortlisted') AS total_shortlisted,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.employer_id = $1 AND a.status = 'placed') AS total_placed`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

// =======================================================================
// Placement tracking (spec 5.9) — the placements table has existed since
// 002_employer_search.sql but nothing read or wrote to it until now.
// Shared across employer- and TSP-posted opportunities: originally this
// was employer-only, on the theory that a TSP programme reaching
// 'completed' is a training outcome ("Train"), not an employment
// placement ("Place"). Revisited — a TSP is often the party that actually
// knows when its programme graduates get hired, so it needs the same
// confirm/track flow. Funder-posted opportunities are deliberately still
// excluded: funders never see candidate identities (see the Funder
// Portal section), so they have no way to know *which* learner_id to
// confirm a placement for.
// =======================================================================

const PLACEMENT_POSTER_ROLES = ["employer", "tsp", "admin"];

// POST /api/opportunities/:id/placements   body: { learner_id, start_date?, end_date?, notes? }
// Confirms an employment placement for a candidate with an existing
// application — moves it to 'placed' and creates/updates the placements row.
app.post("/api/opportunities/:id/placements", authenticate, async (req, res) => {
  const { id } = req.params;
  const { learner_id, start_date, end_date, notes } = req.body;
  if (!learner_id) return res.status(400).json({ error: "learner_id is required" });
  if (!PLACEMENT_POSTER_ROLES.includes(req.auth.role)) {
    return res.status(403).json({ error: "Only an employer, TSP, or admin can confirm a placement" });
  }

  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    const opp = oppResult.rows[0];
    const posterField = opp.employer_id ? "employer_id" : opp.tsp_id ? "tsp_id" : "funder_id";
    if (!assertOwnsOpportunity(req, res, opp, posterField)) return;

    const appResult = await pool.query("SELECT * FROM applications WHERE learner_id = $1 AND opportunity_id = $2", [learner_id, id]);
    if (appResult.rows.length === 0) return res.status(404).json({ error: "No application from this candidate for this opportunity" });
    const application = appResult.rows[0];

    await pool.query("UPDATE applications SET status = 'placed', updated_at = now() WHERE id = $1", [application.id]);

    const { rows } = await pool.query(
      `INSERT INTO placements (application_id, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (application_id) DO UPDATE SET start_date = $2, end_date = $3, notes = $4
       RETURNING *`,
      [application.id, start_date || null, end_date || null, notes || null]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to confirm placement" });
  }
});

// GET /api/employers/:id/placements
app.get("/api/employers/:id/placements", authenticate, requireRole("employer"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another organisation's placements" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.start_date, p.end_date, p.status, p.notes, p.created_at,
              lp.full_name, lp.surname, o.title AS opportunity_title
       FROM placements p
       JOIN applications a ON a.id = p.application_id
       JOIN opportunities o ON o.id = a.opportunity_id
       JOIN learner_profiles lp ON lp.id = a.learner_id
       WHERE o.employer_id = $1
       ORDER BY p.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load placements" });
  }
});

// PATCH /api/placements/:id   body: { status, end_date? }
const VALID_PLACEMENT_STATUSES = ["active", "completed", "terminated"];
app.patch("/api/placements/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { status, end_date, notes } = req.body || {};
  if (!PLACEMENT_POSTER_ROLES.includes(req.auth.role)) {
    return res.status(403).json({ error: "Only an employer, TSP, or admin can update a placement" });
  }
  if (status !== undefined && !VALID_PLACEMENT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_PLACEMENT_STATUSES.join(", ")}` });
  }
  // notes is deliberately updatable on its own — e.g. logging a reason
  // when terminating, or just adding context while a placement is still
  // active — so status is no longer required on every call.
  if (status === undefined && end_date === undefined && notes === undefined) {
    return res.status(400).json({ error: "Provide at least one of status, end_date, notes to update" });
  }
  try {
    const ownerCheck = await pool.query(
      `SELECT o.employer_id, o.tsp_id FROM placements p
       JOIN applications a ON a.id = p.application_id
       JOIN opportunities o ON o.id = a.opportunity_id
       WHERE p.id = $1`,
      [id]
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ error: "Placement not found" });
    const ownerId = ownerCheck.rows[0].employer_id || ownerCheck.rows[0].tsp_id;
    if (req.auth.role !== "admin" && ownerId !== req.auth.profileId) {
      return res.status(403).json({ error: "Cannot modify another organisation's placement" });
    }
    const { rows } = await pool.query(
      `UPDATE placements SET status = COALESCE($1, status), end_date = COALESCE($2, end_date), notes = COALESCE($3, notes) WHERE id = $4 RETURNING *`,
      [status || null, end_date || null, notes || null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update placement" });
  }
});

// =======================================================================
// TSP Dashboard routes — programmes, candidate pipeline, stats.
// Mirrors the employer routes above but reads/writes the TSP side:
// tsp_candidate_view (visible_to_tsps) instead of learner_search_view,
// and a richer pipeline status set (matched/shortlisted/enrolled/
// completed/withdrawn) instead of the employer's simple shortlist.
// =======================================================================

// GET /api/tsp/opportunities?tsp_id=...
app.get("/api/tsp/opportunities", authenticate, requireRole("tsp"), async (req, res) => {
  const tspId = resolveScopeId(req, req.query.tsp_id);
  try {
    const params = [];
    let where = "";
    if (tspId) { params.push(tspId); where = "WHERE o.tsp_id = $1"; }
    const { rows } = await pool.query(
      `SELECT o.id, o.title, o.opportunity_type, o.funding_source, o.status,
              o.req_province, o.req_age_min, o.req_age_max, o.req_employment_status, o.req_qualification_min,
              t.organisation_name AS tsp_name,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id) AS matched_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'shortlisted') AS shortlisted_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'enrolled') AS enrolled_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'completed') AS completed_count
       FROM opportunities o
       JOIN tsp_profiles t ON t.id = o.tsp_id
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load programmes" });
  }
});

// POST /api/tsp/opportunities
app.post("/api/tsp/opportunities", authenticate, requireRole("tsp"), async (req, res) => {
  const validationError = validateOpportunityInput(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const tspId = req.auth.role === "admin" ? req.body.tsp_id : req.auth.profileId;
  if (!tspId) return res.status(400).json({ error: "tsp_id is required" });
  try {
    const opp = await createOpportunity("tsp_id", tspId, req.body);
    res.status(201).json(opp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create programme" });
  }
});

// GET /api/tsp/opportunities/:id/candidates
// Same scoring logic as the employer endpoint, but against
// tsp_candidate_view and surfacing prior-funded-programme count, since
// TSPs specifically need to check funding-cap eligibility before enrolling.
app.get("/api/tsp/opportunities/:id/candidates", authenticate, requireRole("tsp"), async (req, res) => {
  const { id } = req.params;
  const { province: filterProvince, qualification: filterQual } = req.query;

  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND tsp_id IS NOT NULL", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Programme not found" });
    const opp = oppResult.rows[0];
    if (!assertOwnsOpportunity(req, res, opp, "tsp_id")) return;

    const params = [opp.req_province, opp.req_age_min, opp.req_age_max, opp.req_employment_status, opp.req_qualification_min, id];
    let extraFilters = "";
    if (filterProvince) { params.push(filterProvince); extraFilters += ` AND tcv.province = $${params.length}`; }
    if (filterQual) { params.push(filterQual); extraFilters += ` AND tcv.highest_qualification = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT
         tcv.learner_id, tcv.full_name, tcv.surname, tcv.province, tcv.municipality,
         tcv.highest_qualification, tcv.employment_status, tcv.work_experience,
         tcv.availability_status, tcv.age, tcv.id_verification_status,
         tcv.qualification_verification_status, tcv.career_interests,
         tcv.prior_funded_programme_count,
         a.status AS pipeline_status,
         (  (CASE WHEN tcv.province = $1 THEN 25 ELSE 0 END)
          + (CASE WHEN tcv.age BETWEEN $2 AND $3 THEN 25 ELSE 0 END)
          + (CASE WHEN tcv.employment_status = $4 THEN 25 ELSE 0 END)
          + (CASE WHEN tcv.highest_qualification >= $5::qualification_type THEN 25 ELSE 0 END)
         ) AS total_score
       FROM tsp_candidate_view tcv
       LEFT JOIN applications a ON a.learner_id = tcv.learner_id AND a.opportunity_id = $6
       WHERE 1=1 ${extraFilters}
       ORDER BY total_score DESC, tcv.full_name ASC`,
      params
    );

    await logAccess(req, "view_candidates", "opportunity", id);
    res.json({ opportunity: opp, candidates: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to score candidates" });
  }
});

// POST /api/tsp/opportunities/:id/pipeline   body: { learner_id, score, status }
// status must be one of: shortlisted | enrolled | completed | withdrawn
const VALID_PIPELINE_STATUSES = ["shortlisted", "enrolled", "completed", "withdrawn"];
app.post("/api/tsp/opportunities/:id/pipeline", authenticate, requireRole("tsp"), async (req, res) => {
  const { id } = req.params;
  const { learner_id, score, status } = req.body;
  if (!learner_id || score === undefined || !VALID_PIPELINE_STATUSES.includes(status)) {
    return res.status(400).json({ error: `learner_id, score, and a valid status (${VALID_PIPELINE_STATUSES.join(", ")}) are required` });
  }
  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND tsp_id IS NOT NULL", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Programme not found" });
    if (!assertOwnsOpportunity(req, res, oppResult.rows[0], "tsp_id")) return;

    const { rows } = await pool.query(
      `INSERT INTO applications (learner_id, opportunity_id, eligibility_score, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (learner_id, opportunity_id)
       DO UPDATE SET status = $4, updated_at = now()
       RETURNING *`,
      [learner_id, id, score, status]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update pipeline status" });
  }
});

// GET /api/tsp/:id/dashboard
app.get("/api/tsp/:id/dashboard", authenticate, requireRole("tsp"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another organisation's dashboard" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM opportunities WHERE tsp_id = $1) AS programmes_posted,
         (SELECT count(*) FROM opportunities WHERE tsp_id = $1 AND status = 'open') AS programmes_open,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.tsp_id = $1) AS pipeline_total,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.tsp_id = $1 AND a.status = 'enrolled') AS pipeline_enrolled,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.tsp_id = $1 AND a.status = 'completed') AS pipeline_completed,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.tsp_id = $1 AND a.status = 'placed') AS pipeline_placed`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load TSP dashboard stats" });
  }
});

// GET /api/tsp/:id/placements — mirrors GET /api/employers/:id/placements
app.get("/api/tsp/:id/placements", authenticate, requireRole("tsp"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another organisation's placements" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.start_date, p.end_date, p.status, p.notes, p.created_at,
              lp.full_name, lp.surname, o.title AS opportunity_title
       FROM placements p
       JOIN applications a ON a.id = p.application_id
       JOIN opportunities o ON o.id = a.opportunity_id
       JOIN learner_profiles lp ON lp.id = a.learner_id
       WHERE o.tsp_id = $1
       ORDER BY p.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load placements" });
  }
});

// =======================================================================
// Funder Portal routes — funded-opportunity stats, reporting, and (as of
// this module) a candidate view.
//
// The masking policy was genuinely unresolved from the original brief —
// this module originally shipped with NO candidate-list endpoint at all,
// specifically to avoid guessing at it. Decision (2026-08-06): funders
// get the same full-identity candidate view employers and TSPs already
// have — no masking. Employer/TSP were already unmasked (the brief's
// "name masked, location shown" language described an assumption that
// was never actually implemented), so nothing needed retrofitting there;
// this policy just extends the existing pattern to funders.
//
// Scope note: this is read-only. Funders can now see who a candidate is,
// but shortlisting/pipeline/placement actions remain with the employer
// or TSP actually running the opportunity's operational recruitment —
// the spec still frames funders as "read-mostly" (section 3), and that
// axis (who can act) is independent of the masking axis (who can see).
// =======================================================================

// GET /api/funder/opportunities?funder_id=...
app.get("/api/funder/opportunities", authenticate, requireRole("funder"), async (req, res) => {
  const funderId = resolveScopeId(req, req.query.funder_id);
  try {
    const params = [];
    let where = "";
    if (funderId) { params.push(funderId); where = "WHERE o.funder_id = $1"; }
    const { rows } = await pool.query(
      `SELECT o.id, o.title, o.opportunity_type, o.funding_source, o.status,
              o.req_province, o.req_age_min, o.req_age_max, o.req_employment_status, o.req_qualification_min,
              f.organisation_name AS funder_name,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id) AS matched_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'shortlisted') AS shortlisted_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'enrolled') AS enrolled_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'completed') AS completed_count,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id AND a.status = 'placed') AS placed_count
       FROM opportunities o
       JOIN funder_profiles f ON f.id = o.funder_id
       ${where}
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load funded opportunities" });
  }
});

// POST /api/funder/opportunities
app.post("/api/funder/opportunities", authenticate, requireRole("funder"), async (req, res) => {
  const validationError = validateOpportunityInput(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const funderId = req.auth.role === "admin" ? req.body.funder_id : req.auth.profileId;
  if (!funderId) return res.status(400).json({ error: "funder_id is required" });
  try {
    const opp = await createOpportunity("funder_id", funderId, req.body);
    res.status(201).json(opp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create funded opportunity" });
  }
});

// GET /api/funder/opportunities/:id/candidates
// Same scoring logic as the employer/TSP endpoints — full identity, per
// the masking policy decided 2026-08-06 (see this section's header
// comment). Gated on visible_to_funders rather than visible_to_employers.
// Read-only: no shortlist action here, see the scope note above.
app.get("/api/funder/opportunities/:id/candidates", authenticate, requireRole("funder"), async (req, res) => {
  const { id } = req.params;
  const { province: filterProvince, qualification: filterQual } = req.query;

  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND funder_id IS NOT NULL", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Funded opportunity not found" });
    const opp = oppResult.rows[0];
    if (!assertOwnsOpportunity(req, res, opp, "funder_id")) return;

    const params = [opp.req_province, opp.req_age_min, opp.req_age_max, opp.req_employment_status, opp.req_qualification_min, id];
    let extraFilters = "";
    if (filterProvince) { params.push(filterProvince); extraFilters += ` AND lsv.province = $${params.length}`; }
    if (filterQual) { params.push(filterQual); extraFilters += ` AND lsv.highest_qualification = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT
         lsv.learner_id, lsv.full_name, lsv.surname, lsv.province, lsv.municipality,
         lsv.highest_qualification, lsv.employment_status, lsv.work_experience,
         lsv.availability_status, lsv.age, lsv.id_verification_status,
         lsv.qualification_verification_status, lsv.career_interests,
         a.status AS application_status,
         (  (CASE WHEN lsv.province = $1 THEN 25 ELSE 0 END)
          + (CASE WHEN lsv.age BETWEEN $2 AND $3 THEN 25 ELSE 0 END)
          + (CASE WHEN lsv.employment_status = $4 THEN 25 ELSE 0 END)
          + (CASE WHEN lsv.highest_qualification >= $5::qualification_type THEN 25 ELSE 0 END)
         ) AS total_score
       FROM learner_search_view lsv
       LEFT JOIN applications a ON a.learner_id = lsv.learner_id AND a.opportunity_id = $6
       WHERE lsv.visible_to_funders = TRUE
       ${extraFilters}
       ORDER BY total_score DESC, lsv.full_name ASC`,
      params
    );

    await logAccess(req, "view_candidates", "opportunity", id);
    res.json({ opportunity: opp, candidates: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to score candidates" });
  }
});

// GET /api/funder/opportunities/:id/stats
// Aggregate recruitment/placement stats for one funded opportunity —
// a count per pipeline status, no candidate identities.
app.get("/api/funder/opportunities/:id/stats", authenticate, requireRole("funder"), async (req, res) => {
  const { id } = req.params;
  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND funder_id IS NOT NULL", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Funded opportunity not found" });
    if (!assertOwnsOpportunity(req, res, oppResult.rows[0], "funder_id")) return;

    const { rows } = await pool.query(
      `SELECT status, count(*) AS count FROM applications WHERE opportunity_id = $1 GROUP BY status`,
      [id]
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
    res.json({ opportunity: oppResult.rows[0], stats: byStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load opportunity stats" });
  }
});

// GET /api/funder/:id/dashboard
app.get("/api/funder/:id/dashboard", authenticate, requireRole("funder"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another organisation's dashboard" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM opportunities WHERE funder_id = $1) AS opportunities_posted,
         (SELECT count(*) FROM opportunities WHERE funder_id = $1 AND status = 'open') AS opportunities_open,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.funder_id = $1) AS total_matches,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.funder_id = $1 AND a.status = 'shortlisted') AS total_shortlisted,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.funder_id = $1 AND a.status = 'enrolled') AS total_enrolled,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.funder_id = $1 AND a.status = 'completed') AS total_completed,
         (SELECT count(*) FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.funder_id = $1 AND a.status = 'placed') AS total_placed`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load funder dashboard stats" });
  }
});

// GET /api/funder/opportunities/:id/report.csv
// Covers the spec's "export reports" requirement — a plain CSV of the
// same per-status counts as /stats, no library needed for something
// this small.
app.get("/api/funder/opportunities/:id/report.csv", authenticate, requireRole("funder"), async (req, res) => {
  const { id } = req.params;
  try {
    const oppResult = await pool.query("SELECT * FROM opportunities WHERE id = $1 AND funder_id IS NOT NULL", [id]);
    if (oppResult.rows.length === 0) return res.status(404).json({ error: "Funded opportunity not found" });
    const opp = oppResult.rows[0];
    if (!assertOwnsOpportunity(req, res, opp, "funder_id")) return;

    const { rows } = await pool.query(
      `SELECT status, count(*) AS count FROM applications WHERE opportunity_id = $1 GROUP BY status`,
      [id]
    );
    const lines = ["status,count", ...rows.map((r) => `${r.status},${r.count}`)];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${opp.title.replace(/[^a-z0-9]+/gi, "_")}_report.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// =======================================================================
// Minimal learner route — just enough to observe what the background
// matching job (worker.js / 006_matching_job.sql) produces. Learners
// don't have a dashboard module yet (see project brief gap list); this
// exists so the "notify matched learners" behaviour is testable via the
// API, not just by reading the notifications table directly.
// =======================================================================

// GET /api/learner/:id/notifications
app.get("/api/learner/:id/notifications", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another learner's notifications" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.opportunity_id, o.title AS opportunity_title, n.type, n.channel, n.message,
              n.delivery_status, n.delivered_at, n.created_at, n.read_at
       FROM notifications n
       JOIN opportunities o ON o.id = n.opportunity_id
       WHERE n.learner_id = $1
       ORDER BY n.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

// PATCH /api/learner/notifications/:id/read
app.patch("/api/learner/notifications/:id/read", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: existing } = await pool.query("SELECT learner_id FROM notifications WHERE id = $1", [id]);
    if (existing.length === 0) return res.status(404).json({ error: "Notification not found" });
    if (req.auth.role !== "admin" && existing[0].learner_id !== req.auth.profileId) {
      return res.status(403).json({ error: "Cannot modify another learner's notification" });
    }
    const { rows } = await pool.query("UPDATE notifications SET read_at = now() WHERE id = $1 RETURNING *", [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark notification read" });
  }
});

// =======================================================================
// Admin console — platform-wide reporting (spec 5.10), opportunity
// moderation, and the verification review queue (spec 5.6: "An internal
// review queue for Admin staff where automated checks are inconclusive").
// Every route here is strictly admin-only — requireRole('admin') already
// means "admin or admin" for this argument, i.e. no other role passes.
// =======================================================================

// GET /api/admin/dashboard — platform-wide stats, not scoped to one org.
app.get("/api/admin/dashboard", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM learner_profiles) AS total_learners,
         (SELECT count(*) FROM learner_profiles lp JOIN learner_visibility_settings lvs ON lvs.learner_id = lp.id
            WHERE lvs.visible_to_employers OR lvs.visible_to_tsps OR lvs.visible_to_funders) AS active_learners,
         (SELECT count(DISTINCT learner_id) FROM verification_records WHERE record_type = 'id' AND status = 'verified') AS verified_learners,
         (SELECT count(*) FROM learner_profiles WHERE availability_status = 'Available') AS available_candidates,
         (SELECT count(*) FROM placements) AS placements_achieved,
         (SELECT count(*) FROM applications WHERE status IN ('placed', 'completed')) AS employment_outcomes,
         (SELECT count(*) FROM employer_profiles) AS total_employers,
         (SELECT count(*) FROM tsp_profiles) AS total_tsps,
         (SELECT count(*) FROM funder_profiles) AS total_funders,
         (SELECT count(*) FROM opportunities) AS total_opportunities,
         (SELECT count(*) FROM opportunities WHERE status = 'open') AS open_opportunities,
         (SELECT count(*) FROM verification_records WHERE status = 'pending') AS pending_verifications`
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load admin dashboard stats" });
  }
});

// GET /api/admin/opportunities — every opportunity across all 3 poster
// types, for moderation ("Manage users, moderate opportunities..." — spec
// section 3's Admin row).
app.get("/api/admin/opportunities", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.title, o.opportunity_type, o.status, o.match_threshold,
              CASE WHEN o.employer_id IS NOT NULL THEN 'employer' WHEN o.tsp_id IS NOT NULL THEN 'tsp' ELSE 'funder' END AS poster_type,
              COALESCE(e.company_name, t.organisation_name, f.organisation_name) AS poster_name,
              (SELECT count(*) FROM applications a WHERE a.opportunity_id = o.id) AS matched_count
       FROM opportunities o
       LEFT JOIN employer_profiles e ON e.id = o.employer_id
       LEFT JOIN tsp_profiles t ON t.id = o.tsp_id
       LEFT JOIN funder_profiles f ON f.id = o.funder_id
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load opportunities" });
  }
});

// GET /api/admin/users — read-only registry across all 5 roles.
app.get("/api/admin/users", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.role, u.email, u.mobile, u.status, u.suspended_at, u.created_at,
              COALESCE(lp.full_name || ' ' || lp.surname, ep.company_name, tp.organisation_name, fp.organisation_name, 'ASC Admin') AS display_name
       FROM users u
       LEFT JOIN learner_profiles lp ON lp.user_id = u.id
       LEFT JOIN employer_profiles ep ON ep.user_id = u.id
       LEFT JOIN tsp_profiles tp ON tp.user_id = u.id
       LEFT JOIN funder_profiles fp ON fp.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

// PATCH /api/admin/users/:id/status   body: { status: 'active' | 'suspended' }
// Takes effect immediately — authenticate() checks status on every
// request, so a suspended user's already-issued token stops working on
// their very next call, not just at their next login.
const VALID_USER_STATUSES = ["active", "suspended"];
app.patch("/api/admin/users/:id/status", authenticate, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!VALID_USER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_USER_STATUSES.join(", ")}` });
  }
  if (id === req.auth.sub) {
    return res.status(400).json({ error: "Cannot suspend your own account" });
  }
  try {
    // Computing suspendedAt in JS rather than a SQL CASE WHEN $1 = ... —
    // reusing the same parameter as both a plain SET value and inside a
    // comparison has already caused a real "inconsistent types deduced
    // for parameter" bug once in this codebase (see worker.js's
    // notification-delivery fix); not repeating it here.
    const suspendedAt = status === "suspended" ? new Date() : null;
    const { rows } = await pool.query(
      `UPDATE users SET status = $1, suspended_at = $2 WHERE id = $3 RETURNING id, role, email, status, suspended_at`,
      [status, suspendedAt, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    await logAccess(req, `user_${status}`, "user", id);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user status" });
  }
});

// GET /api/admin/verification-queue — pending ID/qualification/reference/
// employment verification records, oldest first.
app.get("/api/admin/verification-queue", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT vr.id, vr.learner_id, lp.full_name, lp.surname, vr.record_type, vr.status, vr.provider, vr.review_notes, vr.created_at
       FROM verification_records vr
       JOIN learner_profiles lp ON lp.id = vr.learner_id
       WHERE vr.status = 'pending'
       ORDER BY vr.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load verification queue" });
  }
});

// POST /api/admin/verification-records/:id/precheck
// Runs the automated pre-check from verifier.js. Auto-resolves clear
// rejections (a malformed ID number); leaves everything else pending
// with a note for the human reviewer — this is what spec 5.6 means by
// "an internal review queue for Admin staff where automated checks are
// inconclusive." Never auto-resolves to 'verified' — see verifier.js for
// why (this project has no real DHA/SAQA vendor integration).
app.post("/api/admin/verification-records/:id/precheck", authenticate, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT vr.*, lp.id_number FROM verification_records vr JOIN learner_profiles lp ON lp.id = vr.learner_id WHERE vr.id = $1 AND vr.status = 'pending'`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "No pending verification record with that id" });
    const record = rows[0];

    const check = record.record_type === "id" ? await verifier.runIdPreCheck(record.id_number) : await verifier.runQualificationPreCheck();

    if (check.outcome === "rejected") {
      const { rows: updated } = await pool.query(
        `UPDATE verification_records SET status = 'rejected', provider = 'Automated pre-check', review_notes = $1, verified_at = now() WHERE id = $2 RETURNING *`,
        [check.reason, id]
      );
      await logAccess(req, "verification_autorejected", "verification_record", id);
      return res.json({ ...updated[0], auto_resolved: true });
    }

    const { rows: updated } = await pool.query(`UPDATE verification_records SET review_notes = $1 WHERE id = $2 RETURNING *`, [check.reason, id]);
    res.json({ ...updated[0], auto_resolved: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to run pre-check" });
  }
});

// POST /api/admin/verification-records/:id/review   body: { status }
// The only place in this codebase that ever writes 'verified'/'rejected'
// to verification_records — registration only ever creates 'pending' rows
// (see 002/schema.sql design notes: "write-once, admin/vendor-owned").
const VALID_REVIEW_STATUSES = ["verified", "rejected"];
app.post("/api/admin/verification-records/:id/review", authenticate, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!VALID_REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_REVIEW_STATUSES.join(", ")}` });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE verification_records SET status = $1, verified_at = now() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [status, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "No pending verification record with that id" });
    await logAccess(req, `verification_${status}`, "verification_record", id);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to review verification record" });
  }
});

// GET /api/admin/placements — platform-wide placement report (spec 5.9/5.10)
app.get("/api/admin/placements", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.start_date, p.end_date, p.status, p.notes, p.created_at,
              lp.full_name, lp.surname, o.title AS opportunity_title,
              COALESCE(e.company_name, t.organisation_name) AS poster_name,
              CASE WHEN o.employer_id IS NOT NULL THEN 'employer' ELSE 'tsp' END AS poster_type
       FROM placements p
       JOIN applications a ON a.id = p.application_id
       JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN employer_profiles e ON e.id = o.employer_id
       LEFT JOIN tsp_profiles t ON t.id = o.tsp_id
       JOIN learner_profiles lp ON lp.id = a.learner_id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load placements" });
  }
});

// GET /api/admin/placements.csv
app.get("/api/admin/placements.csv", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT lp.full_name, lp.surname, COALESCE(e.company_name, t.organisation_name) AS poster_name, o.title, p.start_date, p.end_date, p.status, p.notes
       FROM placements p
       JOIN applications a ON a.id = p.application_id
       JOIN opportunities o ON o.id = a.opportunity_id
       LEFT JOIN employer_profiles e ON e.id = o.employer_id
       LEFT JOIN tsp_profiles t ON t.id = o.tsp_id
       JOIN learner_profiles lp ON lp.id = a.learner_id
       ORDER BY p.created_at DESC`
    );
    // pg returns DATE columns as JS Date objects; toString() would print a
    // full verbose timestamp (with timezone) into the CSV, so format
    // explicitly as YYYY-MM-DD instead.
    const asDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
    // notes is free text an employer/TSP typed — unlike every other
    // column here, it can genuinely contain commas/quotes/newlines, so it
    // needs real CSV escaping (double any embedded quotes), not just
    // wrapping in quotes like the controlled-vocabulary fields.
    const csvField = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
    const lines = [
      "learner_name,poster,opportunity,start_date,end_date,status,notes",
      ...rows.map((r) => `"${r.full_name} ${r.surname}","${r.poster_name}","${r.title}",${asDate(r.start_date)},${asDate(r.end_date)},${r.status},${csvField(r.notes)}`),
    ];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="placements_report.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate placements report" });
  }
});

// =======================================================================
// Document storage (spec 2.1 "Document Storage") — real upload/download,
// backed by storage.js (local disk for dev, structured to swap for a
// real S3-compatible client later). Files never leave through a static
// route — every read goes through the ownership check below, since these
// are ID copies, CVs, and certificates.
// =======================================================================

const ALLOWED_DOCUMENT_TYPES = ["id_copy", "cv", "certificate", "transcript"];
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype)),
});

// POST /api/learner/:id/documents   multipart/form-data: file, document_type
app.post("/api/learner/:id/documents", authenticate, requireRole("learner"), upload.single("file"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot upload documents for another learner" });
  }
  const { document_type } = req.body;
  if (!ALLOWED_DOCUMENT_TYPES.includes(document_type)) {
    return res.status(400).json({ error: `document_type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(", ")}` });
  }
  if (!req.file) return res.status(400).json({ error: "file is required (field name 'file'), PDF/JPEG/PNG only, up to 10MB" });

  try {
    const key = storage.saveFile(req.file.buffer, id, document_type, req.file.originalname);
    const { rows } = await pool.query(
      `INSERT INTO learner_documents (learner_id, document_type, file_url) VALUES ($1, $2, $3) RETURNING *`,
      [id, document_type, key]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to store document" });
  }
});

// GET /api/learner/:id/documents
app.get("/api/learner/:id/documents", authenticate, requireRole("learner"), async (req, res) => {
  const { id } = req.params;
  if (req.auth.role !== "admin" && id !== req.auth.profileId) {
    return res.status(403).json({ error: "Cannot access another learner's documents" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, document_type, verification_status, uploaded_at, verified_at FROM learner_documents WHERE learner_id = $1 ORDER BY uploaded_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load documents" });
  }
});

// GET /api/documents/:id/download
app.get("/api/documents/:id/download", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM learner_documents WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Document not found" });
    const doc = rows[0];

    if (req.auth.role === "learner" && doc.learner_id !== req.auth.profileId) {
      return res.status(403).json({ error: "Cannot access another learner's document" });
    } else if (req.auth.role !== "learner" && req.auth.role !== "admin") {
      return res.status(403).json({ error: "Only the owning learner or an admin can download this document" });
    }

    const buffer = storage.readFile(doc.file_url);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.document_type}${path.extname(doc.file_url)}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve document" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Serve the built frontend (frontend/dist, produced by `npm run build` in
// frontend/) from this same process/origin — that's what lets the
// dashboards call the API via a relative VITE_API_BASE="" path instead of
// needing CORS configured for a second origin. Only registered if dist/
// actually exists, so the API-only local dev workflow used throughout
// this project (`node server.js` with the frontend dev server running
// separately on :5173) is completely unaffected.
const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // Anything else is a client-side route (react-router) — hand it
  // index.html and let the browser router take over. The negative
  // lookahead keeps this from swallowing an unmatched /api/* route,
  // which should still 404 as a missing endpoint, not as a page.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  console.log("[server] frontend/dist not found — serving API only. Run `npm run build` in frontend/ to also serve the app from this process.");
}

// Multer throws its errors (e.g. file too large) from inside the upload
// middleware, before any route handler's own try/catch runs — without
// this, Express's default error handler serves an HTML page with a full
// stack trace (server file paths included) instead of a clean JSON error.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File too large (10MB max)" : err.message;
    return res.status(413).json({ error: message });
  }
  if (err.corsRejected) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`Employer API listening on http://localhost:${PORT}`));
