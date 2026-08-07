// ASC Skills Connect — Background Job Processor (spec section 2.1)
//
// Listens for the Postgres NOTIFY events fired by 006_matching_job.sql's
// triggers and runs the eligibility-scoring + candidate-matching engine
// (spec 5.4/5.5) asynchronously, instead of only on-demand when someone
// opens a candidates screen in server.js. Run alongside the API:
//   node server.js
//   node worker.js
//
// Reads the same env vars as server.js (see .env.example) — both
// processes must point at the same database.

require("dotenv").config();
const { Client, Pool } = require("pg");
const notifier = require("./notifier");

// Same env-var-with-local-dev-fallback config as server.js — see
// .env.example. Both processes must point at the same database.
const connConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "learner_registration_database",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
};
const pool = new Pool(connConfig);

const POSTER_FIELD_BY_VISIBILITY = { employer_id: "visible_to_employers", tsp_id: "visible_to_tsps", funder_id: "visible_to_funders" };

// Scores every learner visible to this opportunity's poster type against
// its criteria, upserts a 'matched' application for anyone at/above the
// opportunity's match_threshold, and writes a notification for anyone
// newly matched. ON CONFLICT DO NOTHING means a learner a human already
// moved to 'shortlisted' or further is never silently reset back to
// 'matched' by a later re-run.
async function scoreOpportunity(opportunityId) {
  const { rows: oppRows } = await pool.query("SELECT * FROM opportunities WHERE id = $1", [opportunityId]);
  const opp = oppRows[0];
  if (!opp || opp.status !== "open") return;

  const posterField = opp.employer_id ? "employer_id" : opp.tsp_id ? "tsp_id" : "funder_id";
  const visibilityFlag = POSTER_FIELD_BY_VISIBILITY[posterField];

  const { rows: candidates } = await pool.query(
    `SELECT lp.id AS learner_id,
       (  (CASE WHEN lp.province = $1 THEN 25 ELSE 0 END)
        + (CASE WHEN EXTRACT(YEAR FROM age(lp.date_of_birth))::INT BETWEEN $2 AND $3 THEN 25 ELSE 0 END)
        + (CASE WHEN lp.employment_status = $4 THEN 25 ELSE 0 END)
        + (CASE WHEN lp.highest_qualification >= $5::qualification_type THEN 25 ELSE 0 END)
       ) AS total_score
     FROM learner_profiles lp
     JOIN learner_visibility_settings lvs ON lvs.learner_id = lp.id
     WHERE lvs.${visibilityFlag} = TRUE`,
    [opp.req_province, opp.req_age_min, opp.req_age_max, opp.req_employment_status, opp.req_qualification_min]
  );

  let newlyMatched = 0;
  for (const c of candidates) {
    if (c.total_score < opp.match_threshold) continue;
    const { rows: inserted } = await pool.query(
      `INSERT INTO applications (learner_id, opportunity_id, eligibility_score, status)
       VALUES ($1, $2, $3, 'matched')
       ON CONFLICT (learner_id, opportunity_id) DO NOTHING
       RETURNING learner_id`,
      [c.learner_id, opportunityId, c.total_score]
    );
    if (inserted.length > 0) {
      newlyMatched++;
      const message = `You're a ${c.total_score}% match for "${opp.title}" — check it out.`;
      const { rows: notifRows } = await pool.query(
        `INSERT INTO notifications (learner_id, opportunity_id, type, message)
         VALUES ($1, $2, 'matched', $3)
         ON CONFLICT (learner_id, opportunity_id, type) DO NOTHING
         RETURNING id, channel`,
        [c.learner_id, opportunityId, message]
      );
      if (notifRows.length > 0) {
        const status = await notifier.deliver({ learner_id: c.learner_id, channel: notifRows[0].channel, message });
        const deliveredAt = status === "delivered" ? new Date() : null;
        await pool.query(
          `UPDATE notifications SET delivery_status = $1, delivered_at = $2 WHERE id = $3`,
          [status, deliveredAt, notifRows[0].id]
        );
      }
    }
  }
  console.log(`[worker] scored opportunity ${opportunityId} ("${opp.title}"): ${newlyMatched} newly matched, threshold ${opp.match_threshold}`);
}

// A learner's profile changed (or they just registered) — re-run scoring
// against every currently-open opportunity they're visible to, across
// all three poster types.
async function scoreLearnerAgainstOpenOpportunities(learnerId) {
  const { rows: opps } = await pool.query(
    `SELECT o.id FROM opportunities o
     JOIN learner_visibility_settings lvs ON lvs.learner_id = $1
     WHERE o.status = 'open'
       AND ( (o.employer_id IS NOT NULL AND lvs.visible_to_employers)
          OR (o.tsp_id IS NOT NULL AND lvs.visible_to_tsps)
          OR (o.funder_id IS NOT NULL AND lvs.visible_to_funders) )`,
    [learnerId]
  );
  for (const opp of opps) await scoreOpportunity(opp.id);
  console.log(`[worker] re-scored learner ${learnerId} against ${opps.length} open opportunities`);
}

async function main() {
  const listener = new Client(connConfig);
  await listener.connect();
  await listener.query("LISTEN opportunity_created");
  await listener.query("LISTEN learner_profile_changed");

  listener.on("notification", async (msg) => {
    try {
      if (msg.channel === "opportunity_created") await scoreOpportunity(msg.payload);
      else if (msg.channel === "learner_profile_changed") await scoreLearnerAgainstOpenOpportunities(msg.payload);
    } catch (err) {
      console.error("[worker] job failed:", err);
    }
  });

  console.log("[worker] listening for opportunity_created / learner_profile_changed …");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
