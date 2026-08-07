import React, { useState } from "react";
import { createRoot } from "react-dom/client";

import LearnerRegistration from "../../asc_learner_registration_live.jsx";
import EmployerDashboard from "../../asc_employer_dashboard_live.jsx";
import TspDashboard from "../../asc_tsp_dashboard_live.jsx";
import FunderDashboard from "../../asc_funder_dashboard_live.jsx";
import AdminDashboard from "../../asc_admin_dashboard_live.jsx";

const DASHBOARDS = {
  learner: { label: "Learner Registration", Component: LearnerRegistration },
  employer: { label: "Employer", Component: EmployerDashboard },
  tsp: { label: "TSP", Component: TspDashboard },
  funder: { label: "Funder", Component: FunderDashboard },
  admin: { label: "Admin", Component: AdminDashboard },
};

function Shell() {
  const [active, setActive] = useState("employer");
  const { Component } = DASHBOARDS[active];
  return (
    <div>
      <nav style={{ display: "flex", gap: 8, padding: "10px 16px", background: "#16324F", position: "sticky", top: 0, zIndex: 100 }}>
        {Object.entries(DASHBOARDS).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              background: active === key ? "#0E7C7B" : "transparent",
              color: "#fff",
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <Component key={active} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);
