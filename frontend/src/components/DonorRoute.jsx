import { API_BASE_URL } from "../api";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { toast } from "react-hot-toast";

export default function DonorRoute({
  children,
  requireOnboarding = false,
}) {
  const location = useLocation();

  const [state, setState] = useState({
    loading: true,
    authorized: false,
    status: null,
    onboardingStep: null,
    authError: null,
  });

  const [toastShown, setToastShown] = useState(false);

  const isReplacingRejectedDocument =
    location.pathname === "/verification/documents" &&
    location.state?.replaceRejected === true;

  useEffect(() => {
    let mounted = true;

    const checkDonorAccess = async (firebaseUser) => {
      if (!firebaseUser) {
        if (mounted) {
          setState({
            loading: false,
            authorized: false,
            status: null,
            onboardingStep: null,
            authError: null,
          });
        }
        return;
      }

      try {
        /*
         * Do not force-refresh the Firebase ID token here.
         *
         * getIdToken() reuses the cached token when it is still valid
         * and refreshes only when Firebase determines that a refresh
         * is actually required.
         */
        const passwordUser = firebaseUser.providerData.some(
          (provider) => provider.providerId === "password"
        );

        if (
          passwordUser &&
          firebaseUser.emailVerified !== true
        ) {
          if (mounted) {
            setState({
              loading: false,
              authorized: false,
              status: "email-unverified",
              onboardingStep: null,
              authError: null,
            });
          }
          return;
        }

        const token = await firebaseUser.getIdToken();

        const response = await fetch(
          `${API_BASE_URL}/auth/me/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const profile = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            profile.detail ||
            "Unable to verify donor profile."
          );
        }

        if (!mounted) return;

        const isDonor = profile.role === "donor";

        const accountStatus =
          profile.account_status ||
          profile.status;

        const effectiveStatus =
          profile.is_active === false
            ? "inactive"
            : accountStatus;

        if (!isDonor) {
          setState({
            loading: false,
            authorized: false,
            status: accountStatus,
            onboardingStep: null,
            authError: null,
          });
          return;
        }

        /*
         * Onboarding routes are allowed for pending/active donors.
         */
        if (requireOnboarding) {
          if (
            effectiveStatus !== "pending" &&
            effectiveStatus !== "active"
          ) {
            setState({
              loading: false,
              authorized: false,
              status: effectiveStatus,
              onboardingStep: null,
              authError: null,
            });
            return;
          }

          const onboardingResponse = await fetch(
            `${API_BASE_URL}/communities/onboarding/status/`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          const onboardingData =
            await onboardingResponse
              .json()
              .catch(() => ({}));
          console.log(
            "DONOR ONBOARDING STATUS:",
            onboardingData
          );

          if (!onboardingResponse.ok) {
            throw new Error(
              onboardingData.detail ||
              "Unable to check donor onboarding status."
            );
          }

          if (!mounted) return;

          const nextStep =
            onboardingData.next_step || null;

          setState({
            loading: false,
            authorized: true,
            status: effectiveStatus,
            onboardingStep: nextStep,
            authError: null,
          });

          return;
        }

        /*
         * Normal donor workspace requires an active donor.
         */
        if (effectiveStatus !== "active") {
          setState({
            loading: false,
            authorized: false,
            status: effectiveStatus,
            onboardingStep: null,
            authError: null,
          });
          return;
        }

        const onboardingResponse = await fetch(
          `${API_BASE_URL}/communities/onboarding/status/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const onboardingData =
          await onboardingResponse
            .json()
            .catch(() => ({}));

        if (!onboardingResponse.ok) {
          throw new Error(
            onboardingData.detail ||
            "Unable to check donor onboarding status."
          );
        }

        if (!mounted) return;

        setState({
          loading: false,
          authorized: true,
          status: effectiveStatus,
          onboardingStep:
            onboardingData.next_step || null,
          authError: null,
        });
      } catch (error) {
        console.error(
          "Donor authorization failed:",
          error
        );

        if (!mounted) return;

        /*
         * A Firebase token-refresh failure is NOT a role failure.
         * Keep the user out of the protected area rather than sending
         * them to Access Denied, which is specifically for authorization
         * failures.
         */
        setState({
          loading: false,
          authorized: false,
          status: null,
          onboardingStep: null,
          authError:
            error?.code ||
            error?.message ||
            "Unable to verify your session.",
        });
      }
    };

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        checkDonorAccess(firebaseUser);
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [
    requireOnboarding,
    isReplacingRejectedDocument,
  ]);

  if (state.loading) {
    return (
      <div className="bb-route-loading">
        Checking donor access...
      </div>
    );
  }

  /*
   * Firebase/session errors must not be represented as role errors.
   */
  if (state.authError) {
    return (
      <div className="bb-route-loading">
        Unable to verify your session. Please try again.
      </div>
    );
  }

  if (!state.authorized) {
    if (state.status === "email-unverified") {
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

    if (
      state.status === "pending" ||
      state.status === "rejected"
    ) {
      return (
        <Navigate
          to="/verification/pending"
          replace
          state={{
            from: location,
          }}
        />
      );
    }

    return (
      <Navigate
        to="/access-denied"
        replace
      />
    );
  }

  if (
    requireOnboarding &&
    !isReplacingRejectedDocument
  ) {
    if (
      state.onboardingStep ===
      "community_selection"
    ) {
      if (
        location.pathname !==
        "/donor/onboarding/community"
      ) {
        if (!toastShown) {
          toast.error(
            "Please complete the community selection step first."
          );
          setToastShown(true);
        }

        return (
          <Navigate
            to="/donor/onboarding/community"
            replace
            state={{ from: location }}
          />
        );
      }
    }

    if (
      state.onboardingStep === "documents"
    ) {
      if (
        location.pathname !==
        "/verification/documents"
      ) {
        return (
          <Navigate
            to="/verification/documents"
            replace
            state={{ from: location }}
          />
        );
      }
    }

    if (
      state.onboardingStep ===
      "community_review"
    ) {
      if (
        location.pathname !==
        "/donor/onboarding/review"
      ) {
        return (
          <Navigate
            to="/donor/onboarding/review"
            replace
            state={{ from: location }}
          />
        );
      }
    }

    if (
      state.onboardingStep === "dashboard"
    ) {
      if (
        location.pathname !==
        "/donor/dashboard"
      ) {
        return (
          <Navigate
            to="/donor/dashboard"
            replace
            state={{ from: location }}
          />
        );
      }
    }
  }

  if (
    !requireOnboarding &&
    state.onboardingStep &&
    state.onboardingStep !== "dashboard"
  ) {
    const onboardingPath = {
      community_selection:
        "/donor/onboarding/community",
      documents:
        "/verification/documents",
      community_review:
        "/donor/onboarding/review",
    }[state.onboardingStep];

    if (onboardingPath) {
      return (
        <Navigate
          to={onboardingPath}
          replace
          state={{ from: location }}
        />
      );
    }
  }

  return children;
}