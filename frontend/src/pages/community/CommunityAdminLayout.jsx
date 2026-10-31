import { API_BASE_URL as API_BASE } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import NotificationCenter from "../../components/NotificationCenter";
import WorkspaceLogoutButton from "../../components/WorkspaceLogoutButton";
import "../admin/AdminLayout.css";

const nav = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", path: "/community/dashboard", icon: "◫", end: true }] },
  { title: "DONORS", items: [{ label: "Membership applications", path: "/community/applications", icon: "♙" }, { label: "Community members", path: "/community/members", icon: "♧" }] },
  { title: "COORDINATION", items: [{ label: "Blood coordination", path: "/community/blood-coordination", icon: "♡" }, { label: "Announcements", path: "/community/announcements", icon: "▤" }, { label: "Donation camps", path: "/community/donation-camps", icon: "✚" }, { label: "Activity history", path: "/community/activity-history", icon: "◷" }] },
  { title: "COMMUNITY", items: [{ label: "Profile & reviews", path: "/community/profile", icon: "▤" }] },
];

export default function CommunityAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState(null);
  const [community, setCommunity] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const tokenFor = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error("Your session has expired. Please sign in again.");
    return current.getIdToken();
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = auth.onAuthStateChanged(async (current) => {
      if (!mounted) return;
      setUser(current);
      if (!current) { setProfile(null); setCommunity(null); return; }
      try {
        const token = await current.getIdToken();
        const [profileResponse, communityResponse] = await Promise.all([
          fetch(`${API_BASE}/auth/me/`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/communities/my/`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const profileData = await profileResponse.json().catch(() => ({}));
        const communityData = await communityResponse.json().catch(() => ({}));
        if (!profileResponse.ok) throw new Error(profileData.detail || "Unable to load account profile.");
        if (!communityResponse.ok) throw new Error(communityData.detail || "Unable to load community profile.");
        if (mounted) { setProfile(profileData); setCommunity(communityData.community || communityData); }
      } catch (error) { console.error("Community workspace profile loading failed:", error); }
    });
    const handleProfileUpdated = (event) => {
      if (event.detail?.profile_picture !== undefined) setProfile((current) => ({ ...current, profile_picture: event.detail.profile_picture }));
      if (event.detail?.full_name) setProfile((current) => ({ ...current, full_name: event.detail.full_name }));
    };
    window.addEventListener("bloodbridge-profile-updated", handleProfileUpdated);
    return () => { mounted = false; unsubscribe(); window.removeEventListener("bloodbridge-profile-updated", handleProfileUpdated); };
  }, []);

  const avatarText = (profile?.full_name || user?.displayName || user?.email || "CA").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const pageTitle = location.pathname === "/community" || location.pathname === "/community/dashboard" ? "Overview" : location.pathname.includes("applications") ? "Membership applications" : location.pathname.includes("members") ? "Community members" : location.pathname.includes("blood-coordination") ? "Blood coordination" : location.pathname.includes("announcements") ? "Announcements" : location.pathname.includes("donation-camps") ? "Donation camps" : location.pathname.includes("activity-history") ? "Community activity" : location.pathname === "/community/activity-history" ? "Community activity" : "Profile & reviews";

  return (
    <div className="bb-admin-shell">
      {menuOpen && <button className="bb-admin-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
      <aside id="bb-admin-navigation" className={`bb-admin-sidebar${menuOpen ? " bb-admin-sidebar-open" : ""}`}>
        <div className="bb-admin-brand"><div className="bb-admin-brand-icon">♥</div><div><strong>BloodBridge</strong><span>COMMUNITY ADMIN</span></div><button className="bb-admin-close-menu" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}>×</button></div>
        <br />
        <nav className="bb-admin-nav" aria-label="Community admin navigation">
          {nav.map((group) => <div className="bb-admin-nav-group" key={group.title}><p>{group.title}</p>{group.items.map((item) => <NavLink key={item.path} to={item.path} end={item.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => `bb-admin-nav-link${isActive ? " active" : ""}`}><span className="bb-admin-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></NavLink>)}</div>)}
        </nav>
        <div className="bb-admin-sidebar-bottom">
          <div className="bb-admin-support-card"><span className="bb-admin-support-icon">♥</span><strong>{community?.name || "Your community"}</strong><span>Review donor applications and grow a trusted local network.</span></div>
          <div className="bb-admin-user-profile"><div className="bb-admin-user-avatar">{profile?.profile_picture ? <img src={profile.profile_picture} alt="" className="bb-admin-avatar-image" /> : avatarText}</div><div className="bb-admin-user-details"><strong>{profile?.full_name || user?.displayName || user?.email?.split("@")[0] || "Community Admin"}</strong><span>Community Admin</span></div></div>
          <WorkspaceLogoutButton onLogout={() => setMenuOpen(false)} />
        </div>
      </aside>
      <div className="bb-admin-main">
        <header className="bb-admin-topbar"><div className="bb-admin-topbar-left"><button className="bb-admin-menu-button" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="bb-admin-navigation" onClick={() => setMenuOpen((open) => !open)}><span /><span /><span /></button><div className="bb-admin-breadcrumb"><span>BloodBridge</span><span aria-hidden="true">/</span><strong>{pageTitle}</strong></div></div>
          <div className="bb-admin-topbar-actions"><span className="bb-admin-secure-label"><span />Secure workspace</span><NotificationCenter /><button type="button" className="bb-admin-topbar-profile-button" onClick={() => navigate("/community/profile")} title="Community profile" aria-label="Open community profile">{profile?.profile_picture ? <img src={profile.profile_picture} alt="" className="bb-admin-avatar-image" /> : avatarText || "CA"}</button></div>
        </header>
        <main className="bb-admin-page-content"><Outlet context={{ community, profile, reloadCommunity: async () => { const token = await tokenFor(); const response = await fetch(`${API_BASE}/communities/my/`, { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.detail || "Unable to reload community."); setCommunity(data.community || data); } }} /></main>
        <footer className="bb-admin-footer"><span>© {new Date().getFullYear()} BloodBridge</span><span>Share consented availability and city-level locations only. Hospital donor selection and invitations remain hospital-controlled.</span></footer>
      </div>
      
    </div>
  );
}
