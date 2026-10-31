import { API_BASE_URL as API_BASE } from "../api";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

export default function CommunityAdminRoute({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, role: null, status: null });

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (mounted) setState({ loading: false, role: null, status: null });
        return;
      }

      try {
        await user.reload();
        const refreshed = auth.currentUser;
        const passwordUser = refreshed?.providerData.some((p) => p.providerId === "password");
        if (passwordUser && !refreshed.emailVerified) {
          if (mounted) setState({ loading: false, role: "email-unverified", status: null });
          return;
        }
        const token = await refreshed.getIdToken(true);
        const response = await fetch(`${API_BASE}/auth/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to verify account.");
        if (mounted) setState({ loading: false, role: data.role, status: data.account_status || data.status });
      } catch (error) {
        console.error("Community admin authorization failed:", error);
        if (mounted) setState({ loading: false, role: null, status: null });
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  if (state.loading) return <div className="bb-route-loading">Checking community access...</div>;
  if (state.role === "email-unverified") {
    return <Navigate to="/register" replace state={{ emailVerificationRequired: true }} />;
  }
  if (!state.role) return <Navigate to="/login" replace state={{ from: location }} />;
  if (state.role !== "community_admin") {
  return <Navigate to="/access-denied" replace />;
}
  if (state.status !== "active") return <Navigate to="/verification/pending" replace state={{ from: location }} />;
  return children;
}
