import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import LearnerRegistration from "../../asc_learner_registration_live.jsx";
import EmployerDashboard from "../../asc_employer_dashboard_live.jsx";
import TspDashboard from "../../asc_tsp_dashboard_live.jsx";
import FunderDashboard from "../../asc_funder_dashboard_live.jsx";
import AdminDashboard from "../../asc_admin_dashboard_live.jsx";

// Palette and type sourced from the live africaskillsconnect.co.za brand,
// same tokens as the five dashboards (see their own token-block comments).
const NAVY = "#152B3C";
const ACCENT = "#D9761F";
const BG = "#FBF7F2";
const BORDER = "#E8DFD3";
const SLATE = "#3C4854";
const MUTED = "#7E8C8C";
const FONT_BODY = "\"Karla\", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const FONT_DISPLAY = "\"Poppins\", \"Karla\", ui-sans-serif, system-ui, sans-serif";
const HERO_GRADIENT = "linear-gradient(160deg, #152B3C 0%, #1E4256 55%, #123549 100%)";

const ROLES = [
  { path: "/learner", label: "Learner", description: "Register, or sign in to your Digital Skills Passport and browse opportunities." },
  { path: "/employer", label: "Employer", description: "Search candidates, shortlist, and confirm placements." },
  { path: "/tsp", label: "TSP", description: "Manage your learner pipeline from match through completion." },
  { path: "/funder", label: "Funder", description: "View funded programme stats and candidate outcomes." },
  { path: "/admin", label: "Admin", description: "Platform-wide reporting, moderation, and verification review." },
];

function Landing() {
  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT_BODY }}>
      <div style={{ background: HERO_GRADIENT, padding: "56px 24px 72px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", background: "#fff", borderRadius: 10, padding: "8px 14px", marginBottom: 24 }}>
            <img src="/asc-logo.png" alt="Africa Skills Connect" style={{ height: 32, width: "auto", display: "block" }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_DISPLAY, letterSpacing: 1.4, color: "#F2C94C", textTransform: "uppercase" }}>Skills Connect Platform</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: FONT_DISPLAY, color: "#fff", marginTop: 6, marginBottom: 8, letterSpacing: "-0.01em" }}>Who's signing in?</div>
          <div style={{ fontSize: 15, color: "#CBDCE0", maxWidth: 480 }}>Pick a role to continue — each has its own sign-in and dashboard.</div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 64px" }}>
        <div style={{ display: "grid", gap: 12, marginTop: -32 }}>
          {ROLES.map((role) => (
            <Link
              key={role.path}
              to={role.path}
              style={{
                display: "block", padding: "20px 22px", borderRadius: 16,
                border: `1.5px solid ${BORDER}`, background: "#fff", textDecoration: "none",
                boxShadow: "0 1px 2px rgba(21,43,60,0.04)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT_DISPLAY, color: NAVY }}>{role.label}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 3 }}>{role.description}</div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 40, fontSize: 12, color: MUTED, textAlign: "center" }}>
          Africa Skills Connect (Pty) Ltd — Connecting Learning and Success
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/learner" element={<LearnerRegistration />} />
        <Route path="/employer" element={<EmployerDashboard />} />
        <Route path="/tsp" element={<TspDashboard />} />
        <Route path="/funder" element={<FunderDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<App />);
