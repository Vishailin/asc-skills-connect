import React, { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, Briefcase, ShieldCheck, Wifi, WifiOff, LogOut, Lock, Check, X as XIcon, Users, Ban, RotateCcw } from "lucide-react";

const NAVY = "#16324F";
const TEAL = "#0E7C7B";
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
const TOKEN_KEY = "asc_admin_token";

const POSTER_COLOR = { employer: TEAL, tsp: AMBER, funder: "#7B5EA7" };
const ROLE_COLOR = { employer: TEAL, tsp: AMBER, funder: "#7B5EA7", learner: "#4C7BE8", admin: NAVY };

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
        This screen calls the same Express + PostgreSQL API as the other dashboards (employer-api/server.js),
        tested end-to-end with curl, but this artifact preview has no network route to it. Run
        <code> node server.js</code> in an environment this file can reach to see it load real platform data.
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
          <div style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>Admin Sign In</div>
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>Demo account: admin@ascskillsconnect.co.za / Passw0rd!</div>
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

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking");
  const [authStatus, setAuthStatus] = useState("checking");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [queue, setQueue] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [ownUserId, setOwnUserId] = useState(null);

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
      setOwnUserId(me.userId);
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
      if (data.role !== "admin") { setLoginError("This account isn't an admin account."); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      const meR = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } });
      const me = await meR.json();
      setOwnUserId(me.userId);
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
    setAuthStatus("unauthenticated");
  }

  const loadDashboard = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/admin/dashboard`);
    setDashboard(await r.json());
  }, [authFetch]);

  const loadOpportunities = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/admin/opportunities`);
    setOpportunities(await r.json());
  }, [authFetch]);

  const loadQueue = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/admin/verification-queue`);
    setQueue(await r.json());
  }, [authFetch]);

  const loadUsers = useCallback(async () => {
    const r = await authFetch(`${API_BASE}/api/admin/users`);
    setUsers(await r.json());
  }, [authFetch]);

  useEffect(() => { (async () => { const ok = await checkApi(); if (ok) checkSession(); })(); }, [checkApi, checkSession]);
  useEffect(() => { if (apiStatus === "connected" && authStatus === "authenticated") { loadDashboard(); loadOpportunities(); loadQueue(); loadUsers(); } }, [apiStatus, authStatus, loadDashboard, loadOpportunities, loadQueue, loadUsers]);

  async function setUserStatus(userId, status) {
    setUpdatingUserId(userId);
    try {
      await authFetch(`${API_BASE}/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadUsers();
      await loadDashboard();
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function runPrecheck(recordId) {
    setReviewing(recordId);
    try {
      await authFetch(`${API_BASE}/api/admin/verification-records/${recordId}/precheck`, { method: "POST" });
      await loadQueue();
      await loadDashboard();
    } finally {
      setReviewing(null);
    }
  }

  async function review(recordId, status) {
    setReviewing(recordId);
    try {
      await authFetch(`${API_BASE}/api/admin/verification-records/${recordId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadQueue();
      await loadDashboard();
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "28px 24px", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEAL, textTransform: "uppercase" }}>ASC Skills Connect</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 2 }}>Admin Console</div>
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
              <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={15} />}>Platform Dashboard</TabBtn>
              <TabBtn active={tab === "opportunities"} onClick={() => setTab("opportunities")} icon={<Briefcase size={15} />}>Opportunities</TabBtn>
              <TabBtn active={tab === "queue"} onClick={() => setTab("queue")} icon={<ShieldCheck size={15} />}>
                Verification Queue{queue.length > 0 ? ` (${queue.length})` : ""}
              </TabBtn>
              <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={<Users size={15} />}>Users</TabBtn>
            </div>

            {tab === "dashboard" && dashboard && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Total learners" value={dashboard.total_learners} />
                <StatCard label="Active learners" value={dashboard.active_learners} color={TEAL} />
                <StatCard label="Verified learners" value={dashboard.verified_learners} color={GREEN} />
                <StatCard label="Available candidates" value={dashboard.available_candidates} />
                <StatCard label="Placements achieved" value={dashboard.placements_achieved} color={GREEN} />
                <StatCard label="Employment outcomes" value={dashboard.employment_outcomes} color={GREEN} />
                <StatCard label="Pending verifications" value={dashboard.pending_verifications} color={dashboard.pending_verifications > 0 ? AMBER : GREEN} />
                <StatCard label="Open opportunities" value={dashboard.open_opportunities} color={TEAL} />
                <StatCard label="Employers registered" value={dashboard.total_employers} />
                <StatCard label="TSPs registered" value={dashboard.total_tsps} />
                <StatCard label="Funders registered" value={dashboard.total_funders} />
                <StatCard label="Opportunities posted" value={dashboard.total_opportunities} />
              </div>
            )}

            {tab === "opportunities" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {opportunities.length === 0 && <div style={{ ...cardStyle, color: MUTED, textAlign: "center" }}>No opportunities posted yet.</div>}
                {opportunities.map((o) => (
                  <div key={o.id} style={{ ...cardStyle, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "3px 9px", borderRadius: 999,
                      color: "#fff", background: POSTER_COLOR[o.poster_type], flexShrink: 0,
                    }}>{o.poster_type}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: NAVY }}>{o.title}</div>
                      <div style={{ fontSize: 12.5, color: SLATE, marginTop: 2 }}>{o.poster_name} · {o.opportunity_type} · threshold {o.match_threshold}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{o.matched_count}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>matched</div>
                    </div>
                    <span style={{
                      fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                      color: o.status === "open" ? GREEN : MUTED, background: o.status === "open" ? "#E7F5EC" : "#F1F1F1",
                    }}>{o.status}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "queue" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {queue.length === 0 && <div style={{ ...cardStyle, color: MUTED, textAlign: "center" }}>Nothing pending review.</div>}
                {queue.map((v) => (
                  <div key={v.id} style={{ ...cardStyle, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: NAVY }}>{v.full_name} {v.surname}</div>
                        <div style={{ fontSize: 12.5, color: SLATE, marginTop: 2, textTransform: "capitalize" }}>{v.record_type} verification · pending since {new Date(v.created_at).toLocaleDateString()}</div>
                      </div>
                      <button onClick={() => runPrecheck(v.id)} disabled={reviewing === v.id} style={{
                        fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${TEAL}`, background: "#fff", color: TEAL,
                      }}>{reviewing === v.id ? "Running…" : "Run Pre-Check"}</button>
                      <button onClick={() => review(v.id, "rejected")} disabled={reviewing === v.id} style={{
                        display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, padding: "7px 12px",
                        borderRadius: 8, border: `1px solid ${RED}`, background: "#fff", color: RED, cursor: "pointer",
                      }}><XIcon size={13} /> Reject</button>
                      <button onClick={() => review(v.id, "verified")} disabled={reviewing === v.id} style={{
                        display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, padding: "7px 12px",
                        borderRadius: 8, border: "none", background: GREEN, color: "#fff", cursor: "pointer",
                      }}><Check size={13} /> {reviewing === v.id ? "Saving…" : "Verify"}</button>
                    </div>
                    {v.review_notes && (
                      <div style={{ marginTop: 10, fontSize: 12, color: MUTED, background: BG, borderRadius: 8, padding: "8px 10px" }}>
                        {v.review_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "users" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {users.length === 0 && <div style={{ ...cardStyle, color: MUTED, textAlign: "center" }}>No users found.</div>}
                {users.map((u) => {
                  const isSelf = u.id === ownUserId;
                  const isSuspended = u.status === "suspended";
                  return (
                    <div key={u.id} style={{ ...cardStyle, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "3px 9px", borderRadius: 999,
                        color: "#fff", background: ROLE_COLOR[u.role] || MUTED, flexShrink: 0,
                      }}>{u.role}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: NAVY }}>{u.display_name}{isSelf ? " (you)" : ""}</div>
                        <div style={{ fontSize: 12.5, color: SLATE, marginTop: 2 }}>{u.email} · joined {new Date(u.created_at).toLocaleDateString()}</div>
                      </div>
                      <span style={{
                        fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                        color: isSuspended ? RED : GREEN, background: isSuspended ? "#FBEFE9" : "#E7F5EC",
                      }}>{u.status}</span>
                      {!isSelf && (
                        isSuspended ? (
                          <button onClick={() => setUserStatus(u.id, "active")} disabled={updatingUserId === u.id} style={{
                            display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, padding: "7px 12px",
                            borderRadius: 8, border: "none", background: GREEN, color: "#fff", cursor: "pointer",
                          }}><RotateCcw size={13} /> {updatingUserId === u.id ? "Saving…" : "Reactivate"}</button>
                        ) : (
                          <button onClick={() => setUserStatus(u.id, "suspended")} disabled={updatingUserId === u.id} style={{
                            display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, padding: "7px 12px",
                            borderRadius: 8, border: `1px solid ${RED}`, background: "#fff", color: RED, cursor: "pointer",
                          }}><Ban size={13} /> {updatingUserId === u.id ? "Saving…" : "Suspend"}</button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
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
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value ?? "—"}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
}
const cardStyle = { background: "#fff", borderRadius: 14, padding: 22, border: `1px solid ${BORDER}` };
const inputStyle = { padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13.5, color: SLATE, background: "#fff" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: SLATE, marginBottom: 5 };
