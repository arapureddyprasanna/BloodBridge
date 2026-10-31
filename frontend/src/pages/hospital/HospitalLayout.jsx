import { API_BASE_URL as API_BASE } from "../../api";
import { useEffect, useState } from "react";
import { auth } from "../../firebase";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import NotificationCenter from "../../components/NotificationCenter";
import WorkspaceLogoutButton from "../../components/WorkspaceLogoutButton";
import "../admin/AdminLayout.css";

const navigation = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: "◫", end: true },
    ],
  },
  {
    title: "BLOOD REQUESTS",
    items: [
      { label: "My Requests", path: "/requests", icon: "♡", end: true },
      { label: "Create Request", path: "/requests/create", icon: "✚" },
    ],
  },
  {
    title: "ACTIVITY",
    items: [
      { label: "Donation History", path: "/donation-history", icon: "▥" },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      { label: "Profile", path: "/profile", icon: "♙" },
      { label: "Settings", path: "/settings", icon: "⚙" },
    ],
  },
];

export default function HospitalLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(auth.currentUser);
  const [profilePicture, setProfilePicture] = useState("");
  const [profileName, setProfileName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);


  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (currentUser) => {
      try {
        const token = await currentUser.getIdToken();

        const response = await fetch(`${API_BASE}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Unable to load profile.");
        }

        const data = await response.json();

        if (!mounted) return;

        setProfilePicture(data.profile_picture || "");
        setProfileName(
          data.full_name ||
            currentUser.displayName ||
            currentUser.email?.split("@")[0] ||
            "Hospital Admin"
        );
      } catch (error) {
        console.error("Profile loading failed:", error);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (!mounted) return;

      setUser(currentUser);

      if (currentUser) {
        setProfileName(
          currentUser.displayName ||
            currentUser.email?.split("@")[0] ||
            "Hospital Admin"
        );

        loadProfile(currentUser);
      } else {
        setProfilePicture("");
        setProfileName("");
      }
    });

    const handleProfileUpdated = (event) => {
      if (event.detail?.profile_picture !== undefined) {
        setProfilePicture(event.detail.profile_picture || "");
      }

      if (event.detail?.full_name) {
        setProfileName(event.detail.full_name);
      }
    };

    window.addEventListener(
      "bloodbridge-profile-updated",
      handleProfileUpdated
    );

    return () => {
      mounted = false;
      unsubscribe();

      window.removeEventListener(
        "bloodbridge-profile-updated",
        handleProfileUpdated
      );
    };
  }, []);

  const avatarText = (
    profileName ||
    user?.displayName ||
    user?.email ||
    "HA"
  )
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const pageName =
    location.pathname === "/dashboard"
      ? "Dashboard"
      : location.pathname.startsWith("/requests/create")
        ? "Create Blood Request"
        : location.pathname.startsWith("/requests/")
          ? "Blood Requests"
          : location.pathname === "/requests"
            ? "Blood Requests"
            : location.pathname === "/donation-history"
              ? "Donation History"
              : location.pathname === "/profile"
                ? "Profile"
                : location.pathname === "/settings"
                  ? "Settings"
                  : "Dashboard";

  return (
    <div className="bb-admin-shell">
      {menuOpen && (
        <button
          className="bb-admin-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />
      )}

      <aside
        id="bb-admin-navigation"
        className={`bb-admin-sidebar${
          menuOpen ? " bb-admin-sidebar-open" : ""
        }`}
      >
        <div className="bb-admin-brand">
          <div className="bb-admin-brand-icon">♥</div>

          <div>
            <strong>BloodBridge</strong>
            <span>HOSPITAL ADMIN</span>
          </div>

          <button
            className="bb-admin-close-menu"
            type="button"
            aria-label="Close navigation"
            onClick={closeMenu}
          >
            ×
          </button>
        </div>

        <br />

        <nav className="bb-admin-nav" aria-label="Hospital navigation">
          {navigation.map((group) => (
            <div className="bb-admin-nav-group" key={group.title}>
              <p>{group.title}</p>

              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `bb-admin-nav-link${isActive ? " active" : ""}`
                  }
                >
                  <span className="bb-admin-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>

                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="bb-admin-sidebar-bottom">
          <div className="bb-admin-support-card">
            <span className="bb-admin-support-icon">♥</span>

            <strong>Every drop matters.</strong>

            <span>
              Thank you for keeping our community connected.
            </span>
          </div>

          <div className="bb-admin-user-profile">
            <div className="bb-admin-user-avatar">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Profile"
                  className="bb-admin-avatar-image"
                />
              ) : (
                avatarText
              )}
            </div>

            <div className="bb-admin-user-details">
              <strong>
                {profileName ||
                  user?.displayName ||
                  user?.email?.split("@")[0] ||
                  "Hospital Admin"}
              </strong>

              <span>Hospital Admin</span>
            </div>
          </div>
          <WorkspaceLogoutButton onLogout={closeMenu} />
        </div>
      </aside>

      <div className="bb-admin-main">
        <header className="bb-admin-topbar">
          <div className="bb-admin-topbar-left">
            <button
              className="bb-admin-menu-button"
              type="button"
              aria-label={
                menuOpen ? "Close navigation" : "Open navigation"
              }
              aria-expanded={menuOpen}
              aria-controls="bb-admin-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>

            <div className="bb-admin-breadcrumb">
              <span>BloodBridge</span>
              <span aria-hidden="true">/</span>
              <strong>{pageName}</strong>
            </div>
          </div>

          <div className="bb-admin-topbar-actions">
            <span className="bb-admin-secure-label">
              <span />
              Secure workspace
            </span>

            <NotificationCenter />

            <button
              type="button"
              className="bb-admin-topbar-profile-button"
              onClick={() => navigate("/profile")}
              title="My Profile"
              aria-label="Open My Profile"
            >
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt=""
                  className="bb-admin-avatar-image"
                />
              ) : (
                avatarText || "HA"
              )}
            </button>
          </div>
        </header>

        <main className="bb-admin-page-content">
          <Outlet />
        </main>

        <footer className="bb-admin-footer">
          <span>© {new Date().getFullYear()} BloodBridge</span>

          <span>
            Connecting donors, communities and hospitals.
          </span>
        </footer>
      </div>
    </div>
  );
}
