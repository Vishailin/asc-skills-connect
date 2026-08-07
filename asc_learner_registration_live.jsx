import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldAlert, Wifi, WifiOff, ChevronLeft, ChevronRight, Upload, CheckCircle2, Plus, Trash2, LogOut, Lock, Search, Briefcase, LayoutDashboard, Send, XCircle } from "lucide-react";

const NAVY = "#16324F";
const TEAL = "#0E7C7B";
const TEAL_DARK = "#0A5F5E";
const GREEN = "#2F9E58";
const RED = "#C9564D";
const AMBER = "#E8A33D";
const BG = "#F6F8F8";
const BORDER = "#E1E8E8";
const SLATE = "#3C4854";
const MUTED = "#7E8C8C";

const API_BASE = "http://localhost:4000";
const TOKEN_KEY = "asc_learner_token";

const PROVINCES = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Free State", "Mpumalanga", "North West", "Northern Cape"];
const QUALIFICATIONS = ["Grade 10", "Grade 11", "Matric", "Certificate", "Diploma", "Degree", "Postgraduate"];
const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const EMPLOYMENT_STATUSES = ["Unemployed", "Employed", "Self-Employed"];
const WORK_EXPERIENCES = ["No Experience", "Less than 1 Year", "1-2 Years", "3-5 Years", "5+ Years"];
const OUTCOMES = ["Completed", "Did not complete"];
const OPPORTUNITY_TYPES = ["Learnership", "Internship", "Apprenticeship", "Employment", "Skills Programme", "Bursary"];
const POSTER_COLOR = { employer: TEAL, tsp: AMBER, funder: "#7B5EA7" };
const APPLICATION_STATUS_LABEL = { matched: "Matched", shortlisted: "Shortlisted", enrolled: "Enrolled", completed: "Completed", placed: "Placed", rejected: "Rejected", withdrawn: "Withdrawn" };
const DOCUMENT_TYPES = [
  { key: "id_copy", label: "ID Copy" },
  { key: "cv", label: "CV" },
  { key: "certificate", label: "Qualification Certificate" },
  { key: "transcript", label: "Academic Transcript" },
];

// Client-side mirror of verifier.js's checksum, for instant feedback
// only — the server re-validates authoritatively on submit regardless.
function isValidSaIdChecksum(idNumber) {
  if (!/^\d{13}$/.test(idNumber || "")) return false;
  const digits = idNumber.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = digits[i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === digits[12];
}

const CONSENT_TEXT =
  "I consent to ASC Skills Connect storing my personal information and using it to match me with " +
  "learnerships, internships, apprenticeships, skills programmes, bursaries, and employment opportunities, " +
  "subject to the visibility settings I've chosen below. I understand I can withdraw this consent at any time.";

const STEPS = ["Personal Info", "Education & Docs", "Employment", "Career Interests", "Funding History", "Consent & Visibility", "Review"];

function ApiStatus({ status }) {
  const map = {
    checking: { color: MUTED, text: "Checking API connection…", icon: <Wifi size={13} /> },
    connected: { color: GREEN, text: `Connected to live API (${API_BASE})`, icon: <Wifi size={13} /> },
    error: { color: RED, text: `Can't reach API at ${API_BASE} — run the server locally to see live data`, icon: <WifiOff size={13} /> },
  };
  const s = map[status];
  return <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: s.color, fontWeight: 600, marginBottom: 16 }}>{s.icon} {s.text}</div>;
}
function OfflinePanel() {
  return (
    <div style={{ background: "#fff", border: `1.5px dashed ${BORDER}`, borderRadius: 14, padding: 32, textAlign: "center" }}>
      <WifiOff size={28} color={MUTED} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: 6 }}>API not reachable from this preview</div>
      <div style={{ fontSize: 13.5, color: MUTED, maxWidth: 460, margin: "0 auto" }}>
        Run <code>node server.js</code> in an environment this file can reach to register a real learner.
      </div>
    </div>
  );
}
function Stepper({ current }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 22, flexWrap: "wrap" }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 auto", minWidth: 90 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: done || active ? "#fff" : MUTED,
              background: done ? GREEN : active ? TEAL : BORDER,
            }}>{done ? "✓" : n}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: active ? NAVY : MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
function Badge({ ok, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: ok ? "#E7F5EC" : "#FBEFE9", color: ok ? GREEN : "#B5602F" }}>
      {ok ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}{label}
    </span>
  );
}
function ScoreRing({ score, size = 40 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? GREEN : score >= 50 ? AMBER : RED;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth="4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="4" fill="none"
          strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.3, color: NAVY }}>{score}</div>
    </div>
  );
}
function LoginScreen({ onLogin, onSwitchToRegister, error, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <form onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }} style={{ ...cardStyle, width: 360, maxWidth: "90vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Lock size={16} color={TEAL} />
          <div style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>Learner Sign In</div>
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>Demo account: nomvula.k@example.co.za / Passw0rd!</div>
        <label style={labelStyle}>Email</label>
        <input style={{ ...inputStyle, width: "100%", marginBottom: 12 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={labelStyle}>Password</label>
        <input style={{ ...inputStyle, width: "100%", marginBottom: 16 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div style={{ color: RED, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", background: NAVY, color: "#fff", fontWeight: 700, fontSize: 14 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
        <button type="button" onClick={onSwitchToRegister} style={{ width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 8, border: "none", background: "none", cursor: "pointer", color: TEAL_DARK, fontWeight: 600, fontSize: 12.5 }}>
          New here? Register instead
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking");
  const [authStatus, setAuthStatus] = useState("checking"); // checking | authenticated | unauthenticated
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [profileId, setProfileId] = useState(null);
  const [mode, setMode] = useState("register"); // 'register' | 'login' — only relevant while unauthenticated
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [step, setStep] = useState(1);
  const [careerFields, setCareerFields] = useState([]);
  const [funders, setFunders] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passport, setPassport] = useState(null);

  const [portalTab, setPortalTab] = useState("passport"); // 'passport' | 'browse'
  const [opportunities, setOpportunities] = useState([]);
  const [filterType, setFilterType] = useState("");
  const [filterProvince, setFilterProvince] = useState("");
  const [myApplicationsOnly, setMyApplicationsOnly] = useState(false);
  const [applying, setApplying] = useState(null);

  const [form, setForm] = useState({
    full_name: "", surname: "", id_number: "", date_of_birth: "", gender: "", disability_status: "",
    province: "", municipality: "", email: "", mobile: "", password: "",
    highest_qualification: "Matric", field_of_study: "", institution: "", year_completed: "",
    employment_status: "Unemployed", work_experience: "No Experience",
    career_interest_ids: [],
    hasFundedHistory: false,
    funded_programme_history: [],
    visible_to_employers: true, visible_to_tsps: true, visible_to_funders: false,
    consent_accepted: false,
  });
  const [files, setFiles] = useState({});

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const checkApi = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/health`);
      if (!r.ok) throw new Error();
      setApiStatus("connected");
      return true;
    } catch {
      setApiStatus("error");
      return false;
    }
  }, []);

  const authFetch = useCallback(async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
    if (r.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setAuthStatus("unauthenticated");
    }
    return r;
  }, [token]);

  const checkSession = useCallback(async () => {
    if (!token) { setAuthStatus("unauthenticated"); return; }
    try {
      const r = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const me = await r.json();
      setProfileId(me.profileId);
      setAuthStatus("authenticated");
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setAuthStatus("unauthenticated");
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      const ok = await checkApi();
      if (!ok) return;
      const [cf, fu] = await Promise.all([
        fetch(`${API_BASE}/api/career-fields`).then((r) => r.json()),
        fetch(`${API_BASE}/api/funders`).then((r) => r.json()),
      ]);
      setCareerFields(cf);
      setFunders(fu);
      checkSession();
    })();
  }, [checkApi, checkSession]);

  const loadPassport = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/learner/${profileId}/passport`);
    setPassport(await r.json());
  }, [authFetch, profileId]);

  const loadOpportunities = useCallback(async () => {
    if (!profileId) return;
    const params = new URLSearchParams();
    if (filterType) params.set("opportunity_type", filterType);
    if (filterProvince) params.set("province", filterProvince);
    const r = await authFetch(`${API_BASE}/api/learner/${profileId}/opportunities?${params}`);
    setOpportunities(await r.json());
  }, [authFetch, profileId, filterType, filterProvince]);

  useEffect(() => {
    if (authStatus === "authenticated" && profileId) {
      loadPassport();
      loadOpportunities();
    }
  }, [authStatus, profileId, loadPassport, loadOpportunities]);

  async function login(email, password) {
    setLoggingIn(true);
    setLoginError("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) { setLoginError(data.error || "Login failed"); return; }
      if (data.role !== "learner") { setLoginError("This account isn't a learner account."); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setProfileId(data.profileId);
      setAuthStatus("authenticated");
    } catch {
      setLoginError("Could not reach the API");
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setProfileId(null);
    setPassport(null);
    setAuthStatus("unauthenticated");
    setMode("register");
  }

  async function applyToOpportunity(oppId) {
    setApplying(oppId);
    try {
      await authFetch(`${API_BASE}/api/learner/opportunities/${oppId}/apply`, { method: "POST" });
      await loadOpportunities();
    } finally {
      setApplying(null);
    }
  }

  async function withdrawFromOpportunity(oppId) {
    setApplying(oppId);
    try {
      await authFetch(`${API_BASE}/api/learner/opportunities/${oppId}/withdraw`, { method: "POST" });
      await loadOpportunities();
    } finally {
      setApplying(null);
    }
  }

  function toggleCareerInterest(id) {
    set("career_interest_ids", form.career_interest_ids.includes(id)
      ? form.career_interest_ids.filter((x) => x !== id)
      : [...form.career_interest_ids, id]);
  }
  function addProgramme() {
    set("funded_programme_history", [...form.funded_programme_history, { programme_name: "", funder_id: "", programme_year: "", outcome: "Completed", led_to_employment: false }]);
  }
  function updateProgramme(i, key, value) {
    const rows = [...form.funded_programme_history];
    rows[i] = { ...rows[i], [key]: value };
    set("funded_programme_history", rows);
  }
  function removeProgramme(i) {
    set("funded_programme_history", form.funded_programme_history.filter((_, idx) => idx !== i));
  }

  function validateStep(n) {
    if (n === 1) {
      if (!form.full_name || !form.surname || !form.id_number || !form.date_of_birth || !form.gender || !form.province || !form.municipality || !form.email || !form.mobile || !form.password) {
        return "Please fill in all required fields.";
      }
      if (!/^\d{13}$/.test(form.id_number)) return "ID number must be exactly 13 digits.";
      if (!isValidSaIdChecksum(form.id_number)) return "That ID number doesn't look right — please double-check it.";
      if (!/^0\d{9}$/.test(form.mobile)) return "Mobile number must be 10 digits starting with 0.";
      if (form.password.length < 8) return "Password must be at least 8 characters.";
    }
    if (n === 6 && !form.consent_accepted) return "You need to accept the consent statement to continue.";
    return "";
  }

  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => Math.min(s + 1, 7));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 1));
  }

  async function submitRegistration() {
    const err = validateStep(1) || validateStep(6);
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError("");
    try {
      const body = {
        email: form.email, mobile: form.mobile, password: form.password,
        full_name: form.full_name, surname: form.surname, id_number: form.id_number,
        date_of_birth: form.date_of_birth, gender: form.gender, disability_status: form.disability_status || undefined,
        province: form.province, municipality: form.municipality,
        highest_qualification: form.highest_qualification, field_of_study: form.field_of_study || undefined,
        institution: form.institution || undefined, year_completed: form.year_completed ? Number(form.year_completed) : undefined,
        employment_status: form.employment_status, work_experience: form.work_experience,
        career_interest_ids: form.career_interest_ids,
        funded_programme_history: form.hasFundedHistory
          ? form.funded_programme_history.map((p) => ({ ...p, funder_id: p.funder_id ? Number(p.funder_id) : undefined, programme_year: p.programme_year ? Number(p.programme_year) : undefined }))
          : [],
        visible_to_employers: form.visible_to_employers, visible_to_tsps: form.visible_to_tsps, visible_to_funders: form.visible_to_funders,
        consent_accepted: form.consent_accepted,
      };
      const r = await fetch(`${API_BASE}/api/auth/register-learner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Registration failed"); setSubmitting(false); return; }

      localStorage.setItem(TOKEN_KEY, data.token);

      for (const { key } of DOCUMENT_TYPES) {
        const file = files[key];
        if (!file) continue;
        const fd = new FormData();
        fd.append("document_type", key);
        fd.append("file", file);
        await fetch(`${API_BASE}/api/learner/${data.profileId}/documents`, {
          method: "POST",
          headers: { Authorization: `Bearer ${data.token}` },
          body: fd,
        });
      }

      // Setting these triggers the shared authenticated-effect to load
      // the passport + opportunities, same as the login path — one data
      // flow for "just registered" and "returning and signed in".
      setToken(data.token);
      setProfileId(data.profileId);
      setAuthStatus("authenticated");
    } catch {
      setError("Could not reach the API");
    } finally {
      setSubmitting(false);
    }
  }

  if (apiStatus !== "connected") {
    return (
      <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2, marginBottom: 8 }}>Learner Registration</div>
          <ApiStatus status={apiStatus} />
          {apiStatus === "error" && <OfflinePanel />}
        </div>
      </div>
    );
  }

  if (authStatus === "authenticated") {
    return (
      <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2 }}>My Learner Portal</div>
            </div>
            <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", color: SLATE, cursor: "pointer" }}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
          <ApiStatus status={apiStatus} />

          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <TabBtn active={portalTab === "passport"} onClick={() => setPortalTab("passport")} icon={<LayoutDashboard size={15} />}>My Passport</TabBtn>
            <TabBtn active={portalTab === "browse"} onClick={() => setPortalTab("browse")} icon={<Briefcase size={15} />}>Browse Opportunities</TabBtn>
          </div>

          {portalTab === "passport" && passport && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: TEAL, textTransform: "uppercase" }}>Digital Skills Passport</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 2, marginBottom: 14 }}>{passport.full_name} {passport.surname}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <Badge ok={passport.id_verification_status === "verified"} label={`ID ${passport.id_verification_status}`} />
                <Badge ok={passport.qualification_verification_status === "verified"} label={`Qualification ${passport.qualification_verification_status}`} />
              </div>
              <DetailRow label="Province" value={`${passport.municipality}, ${passport.province}`} />
              <DetailRow label="Qualification" value={passport.highest_qualification} />
              <DetailRow label="Employment" value={passport.employment_status} />
              <DetailRow label="Availability" value={passport.availability_status} />
              <DetailRow label="Career interests" value={(passport.career_interests || []).join(", ") || "—"} />
              <DetailRow label="Documents uploaded" value={passport.documents.length} />
              <DetailRow label="Prior funded programmes" value={passport.funded_programme_history.length} />
              <DetailRow label="Visible to" value={["employers", "tsps", "funders"].filter((r) => passport[`visible_to_${r}`]).join(", ") || "no one (private)"} />
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 14 }}>
                {passport.id_verification_status === "pending" || passport.qualification_verification_status === "pending"
                  ? "Your pending documents are awaiting an ASC admin's review. You'll be notified automatically as matching opportunities get posted."
                  : "You'll be notified automatically as matching opportunities get posted."}
              </div>
            </div>
          )}

          {portalTab === "browse" && (
            <div style={cardStyle}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <Search size={16} color={SLATE} />
                <select style={{ ...inputStyle, width: "auto" }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">All types</option>
                  {OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select style={{ ...inputStyle, width: "auto" }} value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}>
                  <option value="">All provinces</option>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: SLATE, cursor: "pointer", marginLeft: "auto" }}>
                  <input type="checkbox" checked={myApplicationsOnly} onChange={(e) => setMyApplicationsOnly(e.target.checked)} />
                  My applications only
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {opportunities
                  .filter((o) => !myApplicationsOnly || o.application_status)
                  .map((o) => (
                    <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff" }}>
                      <ScoreRing score={o.total_score} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
                          {o.title}
                          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, color: "#fff", background: POSTER_COLOR[o.poster_type] }}>{o.poster_type}</span>
                        </div>
                        <div style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>
                          {o.poster_name} · {o.opportunity_type}{o.req_province ? ` · ${o.req_province}` : ""}{o.req_qualification_min ? ` · ${o.req_qualification_min}+` : ""}
                        </div>
                      </div>
                      {o.application_status ? (
                        o.application_status === "withdrawn" ? (
                          <button onClick={() => applyToOpportunity(o.id)} disabled={applying === o.id} style={{
                            display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                            border: `1px solid ${TEAL}`, background: "#fff", color: TEAL_DARK,
                          }}><Send size={12} /> {applying === o.id ? "Saving…" : "Re-apply"}</button>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: "capitalize", color: TEAL_DARK }}>{APPLICATION_STATUS_LABEL[o.application_status] || o.application_status}</span>
                            {["matched", "shortlisted"].includes(o.application_status) && (
                              <button onClick={() => withdrawFromOpportunity(o.id)} disabled={applying === o.id} style={{
                                display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                                border: `1px solid ${RED}`, background: "#fff", color: RED,
                              }}><XCircle size={12} /> {applying === o.id ? "Saving…" : "Withdraw"}</button>
                            )}
                          </div>
                        )
                      ) : (
                        <button onClick={() => applyToOpportunity(o.id)} disabled={applying === o.id} style={{
                          display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                          border: "none", background: GREEN, color: "#fff",
                        }}><Send size={12} /> {applying === o.id ? "Applying…" : "Apply"}</button>
                      )}
                    </div>
                  ))}
                {opportunities.filter((o) => !myApplicationsOnly || o.application_status).length === 0 && (
                  <div style={{ color: MUTED, fontSize: 14, padding: 20, textAlign: "center" }}>
                    {myApplicationsOnly ? "You haven't applied to anything yet." : "No open opportunities match these filters."}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (apiStatus === "connected" && authStatus === "unauthenticated" && mode === "login") {
    return (
      <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2, marginBottom: 8 }}>Learner Portal</div>
          <ApiStatus status={apiStatus} />
          <LoginScreen onLogin={login} onSwitchToRegister={() => { setMode("register"); setLoginError(""); }} error={loginError} loading={loggingIn} />
        </div>
      </div>
    );
  }

  if (authStatus === "checking") {
    return (
      <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2, marginBottom: 8 }}>Learner Portal</div>
          <ApiStatus status={apiStatus} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2, marginBottom: 8 }}>Learner Registration</div>
          </div>
          <button onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: TEAL_DARK, fontWeight: 600, fontSize: 12.5, marginTop: 4 }}>
            Already registered? Sign in
          </button>
        </div>
        <ApiStatus status={apiStatus} />
        <Stepper current={step} />

        <div style={cardStyle}>
          {step === 1 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Full Name *"><input style={inputStyle} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
                <Field label="Surname *"><input style={inputStyle} value={form.surname} onChange={(e) => set("surname", e.target.value)} /></Field>
              </div>
              <Field label="ID Number *">
                <input style={inputStyle} value={form.id_number} maxLength={13} onChange={(e) => set("id_number", e.target.value.replace(/\D/g, ""))} placeholder="13 digits" />
                {form.id_number.length === 13 && !isValidSaIdChecksum(form.id_number) && (
                  <div style={{ fontSize: 11.5, color: RED, marginTop: 4 }}>That doesn't look like a valid SA ID number — double-check the digits.</div>
                )}
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Date of Birth *"><input type="date" style={inputStyle} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
                <Field label="Gender *">
                  <select style={inputStyle} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select…</option>
                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Disability Status (optional)"><input style={inputStyle} value={form.disability_status} onChange={(e) => set("disability_status", e.target.value)} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Province *">
                  <select style={inputStyle} value={form.province} onChange={(e) => set("province", e.target.value)}>
                    <option value="">Select…</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Municipality *"><input style={inputStyle} value={form.municipality} onChange={(e) => set("municipality", e.target.value)} /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Email *"><input type="email" style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                <Field label="Mobile *"><input style={inputStyle} value={form.mobile} maxLength={10} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} placeholder="0XXXXXXXXX" /></Field>
              </div>
              <Field label="Password * (min 8 characters)"><input type="password" style={inputStyle} value={form.password} onChange={(e) => set("password", e.target.value)} /></Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Highest Qualification">
                <select style={inputStyle} value={form.highest_qualification} onChange={(e) => set("highest_qualification", e.target.value)}>
                  {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Field of Study"><input style={inputStyle} value={form.field_of_study} onChange={(e) => set("field_of_study", e.target.value)} /></Field>
                <Field label="Institution"><input style={inputStyle} value={form.institution} onChange={(e) => set("institution", e.target.value)} /></Field>
              </div>
              <Field label="Year Completed"><input type="number" style={inputStyle} value={form.year_completed} onChange={(e) => set("year_completed", e.target.value)} /></Field>
              <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Supporting documents (optional now — you can add these later)</div>
              {DOCUMENT_TYPES.map(({ key, label }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <Upload size={15} color={SLATE} />
                  <div style={{ flex: 1, fontSize: 13, color: SLATE }}>{label}</div>
                  <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFiles((f) => ({ ...f, [key]: e.target.files[0] }))} style={{ fontSize: 12 }} />
                  {files[key] && <CheckCircle2 size={15} color={GREEN} />}
                </div>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Employment Status">
                <select style={inputStyle} value={form.employment_status} onChange={(e) => set("employment_status", e.target.value)}>
                  {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Work Experience">
                <select style={inputStyle} value={form.work_experience} onChange={(e) => set("work_experience", e.target.value)}>
                  {WORK_EXPERIENCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <div style={{ fontSize: 13, color: SLATE, marginBottom: 12 }}>Select all that apply.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {careerFields.map((cf) => (
                  <label key={cf.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: SLATE, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.career_interest_ids.includes(cf.id)} onChange={() => toggleCareerInterest(cf.id)} />
                    {cf.name}
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: SLATE, cursor: "pointer", marginBottom: 14 }}>
                <input type="checkbox" checked={form.hasFundedHistory} onChange={(e) => { set("hasFundedHistory", e.target.checked); if (!e.target.checked) set("funded_programme_history", []); }} />
                I've been on a government/SETA-funded programme before
              </label>
              {form.hasFundedHistory && (
                <>
                  {form.funded_programme_history.map((p, i) => (
                    <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Programme {i + 1}</span>
                        <button onClick={() => removeProgramme(i)} style={{ background: "none", border: "none", cursor: "pointer", color: RED }}><Trash2 size={14} /></button>
                      </div>
                      <Field label="Programme Name"><input style={inputStyle} value={p.programme_name} onChange={(e) => updateProgramme(i, "programme_name", e.target.value)} /></Field>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                        <Field label="Funder">
                          <select style={inputStyle} value={p.funder_id} onChange={(e) => updateProgramme(i, "funder_id", e.target.value)}>
                            <option value="">Select…</option>
                            {funders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Year"><input type="number" style={inputStyle} value={p.programme_year} onChange={(e) => updateProgramme(i, "programme_year", e.target.value)} /></Field>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <Field label="Outcome">
                          <select style={inputStyle} value={p.outcome} onChange={(e) => updateProgramme(i, "outcome", e.target.value)}>
                            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </Field>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: SLATE, marginTop: 22 }}>
                          <input type="checkbox" checked={p.led_to_employment} onChange={(e) => updateProgramme(i, "led_to_employment", e.target.checked)} />
                          Led to employment
                        </label>
                      </div>
                    </div>
                  ))}
                  <button onClick={addProgramme} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: `1px solid ${TEAL}`, background: "#fff", color: TEAL_DARK, cursor: "pointer" }}>
                    <Plus size={13} /> Add programme
                  </button>
                </>
              )}
            </>
          )}

          {step === 6 && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Who can see your profile?</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: SLATE, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.visible_to_employers} onChange={(e) => set("visible_to_employers", e.target.checked)} /> Visible to employers
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: SLATE, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.visible_to_tsps} onChange={(e) => set("visible_to_tsps", e.target.checked)} /> Visible to training providers (TSPs)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: SLATE, marginBottom: 18, cursor: "pointer" }}>
                <input type="checkbox" checked={form.visible_to_funders} onChange={(e) => set("visible_to_funders", e.target.checked)} /> Visible to funders (SETAs/NSF/corporate CSI)
              </label>
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, fontSize: 12.5, color: SLATE, marginBottom: 12 }}>{CONSENT_TEXT}</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent_accepted} onChange={(e) => set("consent_accepted", e.target.checked)} /> I accept
              </label>
            </>
          )}

          {step === 7 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Review</div>
              <DetailRow label="Name" value={`${form.full_name} ${form.surname}`} />
              <DetailRow label="Email" value={form.email} />
              <DetailRow label="Location" value={`${form.municipality}, ${form.province}`} />
              <DetailRow label="Qualification" value={form.highest_qualification} />
              <DetailRow label="Employment" value={form.employment_status} />
              <DetailRow label="Career interests" value={careerFields.filter((cf) => form.career_interest_ids.includes(cf.id)).map((cf) => cf.name).join(", ") || "None selected"} />
              <DetailRow label="Prior funded programmes" value={form.hasFundedHistory ? form.funded_programme_history.length : 0} />
              <DetailRow label="Documents staged for upload" value={Object.keys(files).length} />
              <DetailRow label="Visible to" value={["employers", "tsps", "funders"].filter((r) => form[`visible_to_${r}`]).join(", ") || "no one (private)"} />
            </>
          )}

          {error && <div style={{ color: RED, fontSize: 12.5, marginTop: 12 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button onClick={back} disabled={step === 1} style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "#fff", color: step === 1 ? BORDER : SLATE, cursor: step === 1 ? "default" : "pointer",
            }}><ChevronLeft size={14} /> Back</button>

            {step < 7 ? (
              <button onClick={next} style={{
                display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 8,
                border: "none", background: NAVY, color: "#fff", cursor: "pointer",
              }}>Next <ChevronRight size={14} /></button>
            ) : (
              <button onClick={submitRegistration} disabled={submitting} style={{
                fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 8, border: "none", background: GREEN, color: "#fff", cursor: "pointer",
              }}>{submitting ? "Registering…" : "Complete Registration"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}`, padding: "6px 0", fontSize: 13.5 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ fontWeight: 600, color: NAVY, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, cursor: "pointer",
      border: `1.5px solid ${active ? NAVY : BORDER}`, background: active ? NAVY : "#fff",
      color: active ? "#fff" : SLATE, fontWeight: 600, fontSize: 13.5,
    }}>{icon}{children}</button>
  );
}
const cardStyle = { background: "#fff", borderRadius: 14, padding: 22, border: `1px solid ${BORDER}` };
const inputStyle = { padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13.5, color: SLATE, background: "#fff", width: "100%", boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 5 };
