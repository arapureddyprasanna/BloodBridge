import { API_BASE_URL } from "../api";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { auth } from "../firebase";

export default function HospitalRoute({ children }) {
  const location = useLocation();

  const [state, setState] = useState({
    loading: true,
    authorized: false,
    status: null,
  });

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          if (mounted) {
            setState({
              loading: false,
              authorized: false,
              status: null,
            });
          }

          return;
        }

        await currentUser.reload();
        const refreshedUser = auth.currentUser;
        const passwordUser = refreshedUser?.providerData.some((provider) => provider.providerId === "password");
        if (passwordUser && !refreshedUser.emailVerified) {
          if (mounted) setState({ loading: false, authorized: false, status: "email-unverified" });
          return;
        }

        const token = await refreshedUser.getIdToken(true);

        const response = await fetch(`${API_BASE_URL}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Unable to verify hospital profile.");
        }

        const profile = await response.json();

        if (!mounted) return;

        const isHospital = profile.role === "hospital_admin";
        const isActive =
          profile.is_active !== false &&
          (profile.account_status === "active" ||
          profile.status === "active");

        setState({
          loading: false,
          authorized: isHospital && isActive,
          status: profile.account_status || profile.status || null,
        });
      } catch (error) {
        console.error("Hospital authorization failed:", error);

        if (mounted) {
          setState({
            loading: false,
            authorized: false,
            status: null,
          });
        }
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="bb-route-loading">
        Checking hospital access...
      </div>
    );
  }

  if (state.status === "email-unverified") {
    return <Navigate to="/register" replace state={{ emailVerificationRequired: true }} />;
  }

  if (!state.authorized) {
    if (
      state.status === "pending" ||
      state.status === "rejected"
    ) {
      return (
        <Navigate
          to="/verification/pending"
          replace
          state={{ from: location }}
        />
      );
    }

    if (state.status === "suspended") {
      return (
        <Navigate
          to="/login"
          replace
          state={{
            from: location,
            reason: "suspended",
          }}
        />
      );
    }

    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
