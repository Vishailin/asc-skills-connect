import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import LearnerRegistration from "../../asc_learner_registration_live.jsx";
import EmployerDashboard from "../../asc_employer_dashboard_live.jsx";
import TspDashboard from "../../asc_tsp_dashboard_live.jsx";
import FunderDashboard from "../../asc_funder_dashboard_live.jsx";
import AdminDashboard from "../../asc_admin_dashboard_live.jsx";

const ROLES = [
  { path: "/learner", label: "Learner", description: "Register, or sign in to your Digital Skills Passport and browse opportunities." },
  { path: "/employer", label: "Employer", description: "Search candidates, shortlist, and confirm placements." },
  { path: "/tsp", label: "TSP", description: "Manage your learner pipeline from match through completion." },
  { path: "/funder", label: "Funder", description: "View funded programme stats and candidate outcomes." },
  { path: "/admin", label: "Admin", description: "Platform-wide reporting, moderation, and verification review." },
];

function Landing() {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: "#0E7C7B", textTransform: "uppercase" }}>ASC Skills Connect</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#16324F", marginTop: 4, marginBottom: 8 }}>Who's signing in?</div>
        <div style={{ fontSize: 14, color: "#5B6B79", marginBottom: 32 }}>Pick a role to continue — each has its own sign-in and dashboard.</div>
        <div style={{ display: "grid", gap: 12 }}>
          {ROLES.map((role) => (
            <Link
              key={role.path}
              to={role.path}
              style={{
                display: "block", padding: "18px 20px", borderRadius: 12,
                border: "1.5px solid #E1E7EC", background: "#fff", textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#16324F" }}>{role.label}</div>
              <div style={{ fontSize: 13, color: "#5B6B79", marginTop: 2 }}>{role.description}</div>
            </Link>
          ))}
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
