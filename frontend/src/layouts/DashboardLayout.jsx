import { Outlet } from "react-router-dom";
import "./DashboardLayout.css";

function DashboardLayout() {
  return (
    <div className="bb-dashboard-layout">
      <aside className="bb-sidebar">
        <div className="bb-sidebar-logo">
          BloodBridge
        </div>

        <nav className="bb-sidebar-nav">
          <a href="/">Dashboard</a>
          <a href="/requests">Blood Requests</a>
          <a href="/notifications">Notifications</a>
          <a href="/profile">Profile</a>
        </nav>
      </aside>

      <div className="bb-dashboard-main">
        <header className="bb-header">
          <h2>BloodBridge</h2>
        </header>

        <main className="bb-page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;