import { API_BASE_URL } from "../api";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { toast } from "react-hot-toast";

export default function ProtectRoute({
  children,
  requiredRole = null,
}) {
  const [authState, setAuthState] = useState("checking");

  const toastShownFor = useRef(null);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!mounted) return;

        if (!currentUser) {
          setAuthState("unauthenticated");
          return;
        }

        try {
          const isPasswordUser =
            currentUser.providerData.some(
              (provider) =>
                provider.providerId === "password"
            );

          if (
            isPasswordUser &&
            currentUser.emailVerified !== true
          ) {
            if (!mounted) return;

            setAuthState("email-unverified");
            return;
          }

          const token =
            await currentUser.getIdToken();

          const response = await fetch(
            `${API_BASE_URL}/auth/me/`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          const data = await response
            .json()
            .catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              data.detail ||
                "Unable to verify your BloodBridge account."
            );
          }

          if (!mounted) return;

          const accountStatus =
            data.account_status || data.status;

          if (accountStatus === "suspended") {
            setAuthState("suspended");
            return;
          }

          if (
            accountStatus !== "active" &&
            accountStatus !== "pending" &&
            accountStatus !== "rejected"
          ) {
            setAuthState("unauthorized");
            return;
          }

          if (data.is_active === false) {
            setAuthState("unauthorized");
            return;
          }

          if (
            requiredRole &&
            data.role !== requiredRole
          ) {
            setAuthState("role-unauthorized");
            return;
          }

          setAuthState("authorized");
        } catch (error) {
          console.error(
            "Protected route authentication failed:",
            error
          );

          if (!mounted) return;

          setAuthState("unauthenticated");
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [requiredRole]);

  /*
   * =========================================================
   * TOASTS
   * =========================================================
   */

  useEffect(() => {
    if (
      authState === "checking" ||
      authState === "authorized"
    ) {
      return;
    }

    if (
      toastShownFor.current === authState
    ) {
      return;
    }

    toastShownFor.current = authState;

    if (authState === "unauthenticated") {
      toast.error("Please login first.");
      return;
    }

    if (authState === "email-unverified") {
      toast.error(
        "Please verify your email before continuing."
      );
      return;
    }

    if (authState === "suspended") {
      toast.error(
        "Your account is suspended. Please contact support."
      );
      return;
    }

    if (authState === "role-unauthorized") {
      toast.error(
        "You do not have permission to access this area."
      );
    }
  }, [authState]);

  /*
   * =========================================================
   * CHECKING
   * =========================================================
   */

  if (authState === "checking") {
    return <p>Checking login...</p>;
  }

  /*
   * =========================================================
   * UNAUTHENTICATED
   * =========================================================
   */

  if (authState === "unauthenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  /*
   * =========================================================
   * EMAIL NOT VERIFIED
   * =========================================================
   */

  if (authState === "email-unverified") {
    return (
      <Navigate
        to="/register"
        replace
        state={{
          emailVerificationRequired: true,
        }}
      />
    );
  }

  /*
   * =========================================================
   * SUSPENDED
   * =========================================================
   */

  if (authState === "suspended") {
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

  /*
   * =========================================================
   * UNAUTHORIZED
   * =========================================================
   */

  if (authState === "unauthorized") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  /*
   * =========================================================
   * ROLE NOT AUTHORIZED
   * =========================================================
   */

  if (authState === "role-unauthorized") {
    return (
      <Navigate
        to="/access-denied"
        replace
      />
    );
  }

  /*
   * =========================================================
   * AUTHORIZED
   * =========================================================
   *
   * IMPORTANT:
   * This component ONLY protects authentication and role
   * access.
   *
   * It does NOT:
   * - check donor onboarding
   * - check verification application status
   * - redirect donors
   * - show approval messages
   * - call /auth/verification/
   *
   * Donor onboarding is controlled by Login and the
   * donor onboarding state machine.
   */

  return children;
}