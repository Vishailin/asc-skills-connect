import React, { useState, useEffect, useCallback } from "react";
import { Search, X, ShieldCheck, ShieldAlert, LayoutDashboard, GraduationCap, Wifi, WifiOff, AlertTriangle, ChevronRight, LogOut, Lock, Plus, UserCheck, CheckCircle2 } from "lucide-react";

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

// Point this at wherever the API from employer-api/server.js is deployed.
// Empty string in production means same-origin ("" + "/api/..." = "/api/...") —
// the built frontend is served by the same Express process as the API
// (see server.js), so no cross-origin call or CORS_ORIGIN config is
// needed there. Only overridden for local dev against a separate API
// process, or if the frontend and API are ever split across origins.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";
const TOKEN_KEY = "asc_tsp_token";

const PROVINCES = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Free State", "Mpumalanga", "North West", "Northern Cape"];
const QUALIFICATIONS = ["Grade 10", "Grade 11", "Matric", "Certificate", "Diploma", "Degree", "Postgraduate"];

// Pipeline stage order — drives both the progress dots and which action
// button shows next for a given candidate.
const STAGES = ["matched", "shortlisted", "enrolled", "completed"];
// 'placed' isn't a pipeline stage a candidate is auto-advanced through —
// it's a separate outcome confirmed once a completed learner actually
// gets hired (see the "Confirm Placement" action once stage=='completed').
const STAGE_LABEL = { matched: "Matched", shortlisted: "Shortlisted", enrolled: "Enrolled", completed: "Completed", placed: "Placed", withdrawn: "Withdrawn" };
const STAGE_COLOR = { matched: MUTED, shortlisted: AMBER, enrolled: TEAL, completed: GREEN, placed: GREEN, withdrawn: RED };

function ScoreRing({ score, size = 44 }) {
  const r = (size - 7) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? GREEN : score >= 50 ? AMBER : RED;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={BORDER} strokeWidth="5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none"
          strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.32, color: NAVY }}>{score}</div>
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
function PipelineDots({ status }) {
  const idx = status === "withdrawn" ? -1 : status === "placed" ? STAGES.length - 1 : STAGES.indexOf(status || "matched");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {STAGES.map((s, i) => (
        <React.Fragment key={s}>
          <div title={STAGE_LABEL[s]} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= idx ? STAGE_COLOR[s] : BORDER }} />
          {i < STAGES.length - 1 && <div style={{ width: 10, height: 2, background: i < idx ? STAGE_COLOR[STAGES[i + 1]] : BORDER }} />}
        </React.Fragment>
      ))}
    </div>
  );
}
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
        This screen calls the same Express + PostgreSQL API as the employer dashboard (employer-api/server.js),
        tested end-to-end with curl, but this artifact preview has no network route to it. Run <code>node server.js</code>
        in an environment this file can reach to see it load real pipeline data.
      </div>
    </div>
  );
}
function LoginScreen({ onLogin, error, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <form onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }} style={{ ...cardStyle, width: 360, maxWidth: "90vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Lock size={16} color={TEAL} />
          <div style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>TSP Sign In</div>
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>Demo account: admin@ubuntuskills.co.za / Passw0rd!</div>
        <label style={labelStyle}>Email</label>
        <input style={{ ...inputStyle, width: "100%", marginBottom: 12 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={labelStyle}>Password</label>
        <input style={{ ...inputStyle, width: "100%", marginBottom: 16 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div style={{ color: RED, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", background: NAVY, color: "#fff", fontWeight: 700, fontSize: 14 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

const OPPORTUNITY_TYPES = ["Learnership", "Internship", "Apprenticeship", "Employment", "Skills Programme", "Bursary"];
const EMPLOYMENT_STATUSES = ["Unemployed", "Employed", "Self-Employed"];

function NewProgrammeModal({ onClose, onCreate, creating, error }) {
  const [form, setForm] = useState({ title: "", opportunity_type: "Skills Programme", funding_source: "", req_province: "", req_age_min: "", req_age_max: "", req_employment_status: "", req_qualification_min: "", match_threshold: 50 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,50,79,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>New Programme</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: SLATE }}><X size={18} /></button>
        </div>
        <label style={labelStyle}>Title *</label>
        <input style={{ ...inputStyle, width: "100%", marginBottom: 10 }} value={form.title} onChange={(e) => set("title", e.target.value)} />
        <label style={labelStyle}>Type *</label>
        <select style={{ ...inputStyle, width: "100%", marginBottom: 10 }} value={form.opportunity_type} onChange={(e) => set("opportunity_type", e.target.value)}>
          {OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={labelStyle}>Funding Source</label>
        <input style={{ ...inputStyle, width: "100%", marginBottom: 10 }} value={form.funding_source} onChange={(e) => set("funding_source", e.target.value)} placeholder="e.g. SETA-funded" />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Required Province</label>
            <select style={inputStyle} value={form.req_province} onChange={(e) => set("req_province", e.target.value)}>
              <option value="">Any</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ width: 90 }}>
            <label style={labelStyle}>Age min</label>
            <input type="number" style={inputStyle} value={form.req_age_min} onChange={(e) => set("req_age_min", e.target.value)} />
          </div>
          <div style={{ width: 90 }}>
            <label style={labelStyle}>Age max</label>
            <input type="number" style={inputStyle} value={form.req_age_max} onChange={(e) => set("req_age_max", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Required Employment Status</label>
            <select style={inputStyle} value={form.req_employment_status} onChange={(e) => set("req_employment_status", e.target.value)}>
              <option value="">Any</option>
              {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Min Qualification</label>
            <select style={inputStyle} value={form.req_qualification_min} onChange={(e) => set("req_qualification_min", e.target.value)}>
              <option value="">Any</option>
              {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>
        <label style={labelStyle}>Match Threshold ({form.match_threshold})</label>
        <input type="range" min="0" max="100" step="5" style={{ width: "100%", marginBottom: 14 }} value={form.match_threshold} onChange={(e) => set("match_threshold", Number(e.target.value))} />
        {error && <div style={{ color: RED, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button
          disabled={creating || !form.title}
          onClick={() => onCreate({
            ...form,
            req_age_min: form.req_age_min ? Number(form.req_age_min) : undefined,
            req_age_max: form.req_age_max ? Number(form.req_age_max) : undefined,
            req_province: form.req_province || undefined,
            req_employment_status: form.req_employment_status || undefined,
            req_qualification_min: form.req_qualification_min || undefined,
            funding_source: form.funding_source || undefined,
          })}
          style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", background: GREEN, color: "#fff", fontWeight: 700, fontSize: 14 }}
        >{creating ? "Posting…" : "Post Programme"}</button>
      </div>
    </div>
  );
}

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking");
  const [authStatus, setAuthStatus] = useState("checking");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [profileId, setProfileId] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [programmes, setProgrammes] = useState([]);
  const [selectedProgId, setSelectedProgId] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [filterProvince, setFilterProvince] = useState("");
  const [filterQual, setFilterQual] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [moving, setMoving] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [showNewProg, setShowNewProg] = useState(false);
  const [creatingProg, setCreatingProg] = useState(false);
  const [newProgError, setNewProgError] = useState("");
  const [confirmingPlacement, setConfirmingPlacement] = useState(null);
  const [placements, setPlacements] = useState([]);
  const [updatingPlacement, setUpdatingPlacement] = useState(null);

  const authFetch = useCallback(async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
    if (r.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setAuthStatus("unauthenticated");
    }
    return r;
  }, [token]);

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
    setAuthStatus("unauthenticated");
  }

  const loadProgrammes = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/tsp/opportunities?tsp_id=${profileId}`);
    const data = await r.json();
    setProgrammes(data);
    if (Array.isArray(data) && data.length > 0 && !selectedProgId) setSelectedProgId(data[0].id);
  }, [authFetch, profileId, selectedProgId]);

  const loadDashboard = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/tsp/${profileId}/dashboard`);
    setDashboard(await r.json());
  }, [authFetch, profileId]);

  const loadCandidates = useCallback(async (progId) => {
    if (!progId) return;
    const params = new URLSearchParams();
    if (filterProvince) params.set("province", filterProvince);
    if (filterQual) params.set("qualification", filterQual);
    const r = await authFetch(`${API_BASE}/api/tsp/opportunities/${progId}/candidates?${params}`);
    const data = await r.json();
    setCandidates(data.candidates || []);
  }, [authFetch, filterProvince, filterQual]);

  const loadPlacements = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/tsp/${profileId}/placements`);
    setPlacements(await r.json());
  }, [authFetch, profileId]);

  useEffect(() => { (async () => { const ok = await checkApi(); if (ok) checkSession(); })(); }, [checkApi, checkSession]);
  useEffect(() => { if (apiStatus === "connected" && authStatus === "authenticated" && profileId) { loadProgrammes(); loadDashboard(); loadPlacements(); } }, [apiStatus, authStatus, profileId, loadProgrammes, loadDashboard, loadPlacements]);
  useEffect(() => { if (authStatus === "authenticated" && selectedProgId) loadCandidates(selectedProgId); }, [authStatus, selectedProgId, filterProvince, filterQual, loadCandidates]);

  async function advance(candidate) {
    const currentIdx = STAGES.indexOf(candidate.pipeline_status || "matched");
    const nextStatus = STAGES[currentIdx + 1];
    if (!nextStatus) return;
    setMoving(candidate.learner_id);
    try {
      await authFetch(`${API_BASE}/api/tsp/opportunities/${selectedProgId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learner_id: candidate.learner_id, score: candidate.total_score, status: nextStatus }),
      });
      await loadCandidates(selectedProgId);
      await loadDashboard();
      await loadProgrammes();
    } finally {
      setMoving(null);
    }
  }

  async function confirmPlacement(candidate) {
    setConfirmingPlacement(candidate.learner_id);
    try {
      await authFetch(`${API_BASE}/api/opportunities/${selectedProgId}/placements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learner_id: candidate.learner_id, start_date: new Date().toISOString().slice(0, 10) }),
      });
      await loadCandidates(selectedProgId);
      await loadDashboard();
      await loadPlacements();
    } finally {
      setConfirmingPlacement(null);
    }
  }

  async function updatePlacementStatus(placement, status) {
    setUpdatingPlacement(placement.id);
    try {
      await authFetch(`${API_BASE}/api/placements/${placement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadPlacements();
    } finally {
      setUpdatingPlacement(null);
    }
  }

  async function saveNote(placement, notes) {
    setUpdatingPlacement(placement.id);
    try {
      await authFetch(`${API_BASE}/api/placements/${placement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      await loadPlacements();
    } finally {
      setUpdatingPlacement(null);
    }
  }

  async function createProgramme(body) {
    setCreatingProg(true);
    setNewProgError("");
    try {
      const r = await authFetch(`${API_BASE}/api/tsp/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setNewProgError(data.error || "Failed to create programme"); return; }
      setShowNewProg(false);
      await loadProgrammes();
      await loadDashboard();
    } finally {
      setCreatingProg(false);
    }
  }

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2 }}>TSP Dashboard</div>
          </div>
          {authStatus === "authenticated" && (
            <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", color: SLATE, cursor: "pointer" }}>
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
        <ApiStatus status={apiStatus} />

        {apiStatus === "error" && <OfflinePanel />}

        {apiStatus === "connected" && authStatus === "unauthenticated" && (
          <LoginScreen onLogin={login} error={loginError} loading={loggingIn} />
        )}

        {apiStatus === "connected" && authStatus === "authenticated" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={15} />}>Dashboard</TabBtn>
              <TabBtn active={tab === "pipeline"} onClick={() => setTab("pipeline")} icon={<GraduationCap size={15} />}>Learner Pipeline</TabBtn>
              <TabBtn active={tab === "placements"} onClick={() => setTab("placements")} icon={<UserCheck size={15} />}>Placements</TabBtn>
            </div>

            {tab === "dashboard" && dashboard && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
                <StatCard label="Programmes posted" value={dashboard.programmes_posted} />
                <StatCard label="Currently open" value={dashboard.programmes_open} color={TEAL} />
                <StatCard label="Total in pipeline" value={dashboard.pipeline_total} />
                <StatCard label="Enrolled" value={dashboard.pipeline_enrolled} color={AMBER} />
                <StatCard label="Completed" value={dashboard.pipeline_completed} color={GREEN} />
                <StatCard label="Placed" value={dashboard.pipeline_placed} color={GREEN} />
              </div>
            )}

            {tab === "pipeline" && (
              <div style={cardStyle}>
                <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                  {programmes.map((p) => (
                    <button key={p.id} onClick={() => setSelectedProgId(p.id)} style={{
                      textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                      border: `1.5px solid ${selectedProgId === p.id ? TEAL : BORDER}`,
                      background: selectedProgId === p.id ? "#E9F5F4" : "#fff", minWidth: 240,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{p.title}</div>
                      <div style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>{p.matched_count} matched · {p.shortlisted_count} shortlisted · {p.enrolled_count} enrolled · {p.completed_count} completed</div>
                    </button>
                  ))}
                  <button onClick={() => setShowNewProg(true)} style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                    border: `1.5px dashed ${TEAL}`, background: "#fff", color: TEAL_DARK, fontWeight: 700, fontSize: 13, minWidth: 160,
                  }}><Plus size={14} /> New Programme</button>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <Search size={16} color={SLATE} />
                  <select style={inputStyle} value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}>
                    <option value="">All provinces</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select style={inputStyle} value={filterQual} onChange={(e) => setFilterQual(e.target.value)}>
                    <option value="">All qualifications</option>
                    {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>Live query against tsp_candidate_view</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {candidates.length === 0 && <div style={{ color: MUTED, fontSize: 14, padding: 20, textAlign: "center" }}>No candidates match these filters.</div>}
                  {candidates.map((c) => {
                    const stage = c.pipeline_status || "matched";
                    const isWithdrawn = stage === "withdrawn";
                    const isFinal = stage === "completed" || stage === "placed" || isWithdrawn;
                    return (
                      <div key={c.learner_id} onClick={() => setSelectedCandidate(c)} style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        background: "#fff", border: `1px solid ${BORDER}`,
                      }}>
                        <ScoreRing score={c.total_score} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
                            {c.full_name} {c.surname}
                            {Number(c.prior_funded_programme_count) > 0 && (
                              <span title="Has prior NSF/SETA-funded programme history" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#B5602F" }}>
                                <AlertTriangle size={12} /> Prior funding ×{c.prior_funded_programme_count}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: SLATE, marginTop: 2 }}>{c.province} · {c.highest_qualification} · {c.availability_status}</div>
                          <div style={{ marginTop: 5, display: "flex", gap: 6, alignItems: "center" }}>
                            <Badge ok={c.id_verification_status === "verified"} label={c.id_verification_status === "verified" ? "ID verified" : "ID pending"} />
                            <Badge ok={c.qualification_verification_status === "verified"} label={c.qualification_verification_status === "verified" ? "Qual. verified" : "Qual. pending"} />
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <PipelineDots status={c.pipeline_status} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: STAGE_COLOR[stage] }}>{STAGE_LABEL[stage]}</span>
                        </div>
                        {stage === "placed" ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: GREEN, display: "flex", alignItems: "center", gap: 4 }}>
                            <CheckCircle2 size={13} /> Placed
                          </span>
                        ) : stage === "completed" ? (
                          <button onClick={(e) => { e.stopPropagation(); confirmPlacement(c); }} disabled={confirmingPlacement === c.learner_id} style={{
                            fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                            border: "none", background: GREEN, color: "#fff",
                          }}>
                            {confirmingPlacement === c.learner_id ? "Saving…" : "Confirm Placement"}
                          </button>
                        ) : !isFinal && (
                          <button onClick={(e) => { e.stopPropagation(); advance(c); }} disabled={moving === c.learner_id} style={{
                            fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                            border: `1px solid ${TEAL}`, background: "#fff", color: TEAL_DARK, display: "flex", alignItems: "center", gap: 4,
                          }}>
                            {moving === c.learner_id ? "Saving…" : <>Move to {STAGE_LABEL[STAGES[STAGES.indexOf(stage) + 1]]} <ChevronRight size={13} /></>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "placements" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {placements.length === 0 && <div style={{ ...cardStyle, color: MUTED, textAlign: "center" }}>No placements confirmed yet — confirm one from a completed candidate in Learner Pipeline.</div>}
                {placements.map((p) => (
                  <div key={p.id} style={{ ...cardStyle, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: NAVY }}>{p.full_name} {p.surname}</div>
                        <div style={{ fontSize: 12.5, color: SLATE, marginTop: 2 }}>
                          {p.opportunity_title} · started {p.start_date ? new Date(p.start_date).toLocaleDateString() : "—"}
                          {p.end_date ? ` · ends ${new Date(p.end_date).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, textTransform: "capitalize",
                        color: p.status === "active" ? TEAL_DARK : p.status === "completed" ? GREEN : RED,
                        background: p.status === "active" ? "#E9F5F4" : p.status === "completed" ? "#E7F5EC" : "#FBEFE9",
                      }}>{p.status}</span>
                      {p.status === "active" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => updatePlacementStatus(p, "completed")} disabled={updatingPlacement === p.id} style={{
                            fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                            border: `1px solid ${GREEN}`, background: "#fff", color: GREEN,
                          }}>Mark Completed</button>
                          <button onClick={() => updatePlacementStatus(p, "terminated")} disabled={updatingPlacement === p.id} style={{
                            fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                            border: `1px solid ${RED}`, background: "#fff", color: RED,
                          }}>Terminate</button>
                        </div>
                      )}
                    </div>
                    <PlacementNotes placement={p} saving={updatingPlacement === p.id} onSave={(notes) => saveNote(p, notes)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showNewProg && (
        <NewProgrammeModal
          onClose={() => { setShowNewProg(false); setNewProgError(""); }}
          onCreate={createProgramme}
          creating={creatingProg}
          error={newProgError}
        />
      )}

      {selectedCandidate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(22,50,79,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setSelectedCandidate(null)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 380, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: TEAL, textTransform: "uppercase" }}>Digital Skills Passport</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: NAVY, marginTop: 2 }}>{selectedCandidate.full_name} {selectedCandidate.surname}</div>
              </div>
              <button onClick={() => setSelectedCandidate(null)} style={{ background: "none", border: "none", cursor: "pointer", color: SLATE }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}><ScoreRing score={selectedCandidate.total_score} size={72} /></div>
            <DetailRow label="Province" value={`${selectedCandidate.municipality}, ${selectedCandidate.province}`} />
            <DetailRow label="Age" value={selectedCandidate.age} />
            <DetailRow label="Qualification" value={selectedCandidate.highest_qualification} />
            <DetailRow label="Experience" value={selectedCandidate.work_experience} />
            <DetailRow label="Prior funded programmes" value={selectedCandidate.prior_funded_programme_count} />
            <DetailRow label="Pipeline stage" value={STAGE_LABEL[selectedCandidate.pipeline_status || "matched"]} />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Badge ok={selectedCandidate.id_verification_status === "verified"} label={selectedCandidate.id_verification_status === "verified" ? "ID verified" : "ID pending"} />
              <Badge ok={selectedCandidate.qualification_verification_status === "verified"} label={selectedCandidate.qualification_verification_status === "verified" ? "Qual. verified" : "Qual. pending"} />
            </div>
          </div>
        </div>
      )}
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
function StatCard({ label, value, color = NAVY }) {
  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value ?? "—"}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${BORDER}`, padding: "6px 0", fontSize: 13.5 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ fontWeight: 600, color: NAVY }}>{value}</span>
    </div>
  );
}
// Own local draft state so typing in one placement's note box doesn't
// re-render/reset every other card — only this one save button lights
// up once the draft actually diverges from what's saved.
function PlacementNotes({ placement, onSave, saving }) {
  const [draft, setDraft] = useState(placement.notes || "");
  const dirty = draft !== (placement.notes || "");
  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note — reason for termination, performance context, anything worth recording…"
        rows={2}
        style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
      />
      {dirty && (
        <button onClick={() => onSave(draft)} disabled={saving} style={{
          marginTop: 6, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
          border: `1px solid ${TEAL}`, background: "#fff", color: TEAL_DARK,
        }}>{saving ? "Saving…" : "Save Note"}</button>
      )}
    </div>
  );
}
const cardStyle = { background: "#fff", borderRadius: 14, padding: 22, border: `1px solid ${BORDER}` };
const inputStyle = { padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13.5, color: SLATE, background: "#fff" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 5 };
