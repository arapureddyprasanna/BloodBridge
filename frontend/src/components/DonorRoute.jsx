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
  });

  const [toastShown, setToastShown] = useState(false);

  /*
   * ---------------------------------------------------------
   * REJECTED DOCUMENT REPLACEMENT
   *
   * Pending/under-review donors normally follow the onboarding
   * next_step returned by the backend.
   *
   * However, when the community rejects an individual document,
   * PendingVerification sends the donor here with:
   *
   * location.state.replaceRejected === true
   *
   * That is an intentional exception which allows the donor to
   * open the document page even while the overall verification
   * process is still under review.
   * ---------------------------------------------------------
   */
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
          });
        }

        return;
      }

      try {
        await firebaseUser.reload();
        const refreshedUser = auth.currentUser;
        const passwordUser = refreshedUser?.providerData.some((provider) => provider.providerId === "password");
        if (passwordUser && !refreshedUser.emailVerified) {
          if (mounted) {
            setState({ loading: false, authorized: false, status: "email-unverified", onboardingStep: null });
          }
          return;
        }
        if (!refreshedUser) throw new Error("Your session has expired. Please sign in again.");
        const token = await refreshedUser.getIdToken(true);

        /*
         * -----------------------------------------------------
         * BLOODBRIDGE PROFILE
         * -----------------------------------------------------
         */

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

        const isDonor =
          profile.role === "donor";

        const accountStatus =
          profile.account_status ||
          profile.status;

        const effectiveStatus = profile.is_active === false ? "inactive" : accountStatus;

        if (!isDonor) {
          setState({
            loading: false,
            authorized: false,
            status: accountStatus,
            onboardingStep: null,
          });

          return;
        }

        /*
         * -----------------------------------------------------
         * DONOR ONBOARDING
         * -----------------------------------------------------
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

          const nextStep =
            onboardingData.next_step || null;

          /*
           * ---------------------------------------------------
           * IMPORTANT:
           *
           * A donor replacing a rejected document is allowed
           * to remain on the documents page even when the
           * onboarding API normally reports another step.
           *
           * This is NOT a general bypass.
           *
           * The exception is only valid when:
           *
           * 1. Current route is /verification/documents
           * 2. location.state.replaceRejected === true
           *
           * Direct navigation to /verification/documents does
           * NOT get this exception.
           * ---------------------------------------------------
           */

          if (isReplacingRejectedDocument) {
            setState({
              loading: false,
              authorized: true,
              status: effectiveStatus,
              onboardingStep: nextStep,
            });

            return;
          }

          setState({
            loading: false,
            authorized: true,
            status: effectiveStatus,
            onboardingStep: nextStep,
          });

          return;
        }

        /*
         * -----------------------------------------------------
         * NORMAL DONOR WORKSPACE
         *
         * Only ACTIVE donors can enter the dashboard/workspace.
         * -----------------------------------------------------
         */

        if (effectiveStatus !== "active") {
          setState({
            loading: false,
            authorized: false,
            status: effectiveStatus,
            onboardingStep: null,
          });

          return;
        }

        const onboardingResponse = await fetch(
          `${API_BASE_URL}/communities/onboarding/status/`,
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        );
        const onboardingData = await onboardingResponse.json().catch(() => ({}));
        if (!onboardingResponse.ok) {
          throw new Error(onboardingData.detail || "Unable to check donor onboarding status.");
        }

        if (!mounted) return;

        setState({
          loading: false,
          authorized: true,
          status: effectiveStatus,
          onboardingStep: onboardingData.next_step || null,
        });
      } catch (error) {
        console.error(
          "Donor authorization failed:",
          error
        );

        if (!mounted) return;

        setState({
          loading: false,
          authorized: false,
          status: null,
          onboardingStep: null,
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

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (state.loading) {
    return (
      <div className="bb-route-loading">
        Checking donor access...
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * UNAUTHORIZED
   * ---------------------------------------------------------
   */

  if (!state.authorized) {
    if (state.status === "email-unverified") {
      return <Navigate to="/register" replace state={{ emailVerificationRequired: true }} />;
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
          state={{ from: location }}
        />
      );
    }

    return <Navigate to="/access-denied" replace />;
  }

  /*
   * ---------------------------------------------------------
   * ONBOARDING STATE
   *
   * Do NOT apply normal next_step redirects when the donor is
   * intentionally replacing a rejected document.
   * ---------------------------------------------------------
   */

  if (
    requireOnboarding &&
    !isReplacingRejectedDocument
  ) {
    /*
     * -------------------------------------------------------
     * COMMUNITY SELECTION
     *
     * This guarantees that a donor cannot manually type:
     *
     * /verification/documents
     *
     * before selecting a community.
     * -------------------------------------------------------
     */

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

    /*
     * -------------------------------------------------------
     * DOCUMENTS
     * -------------------------------------------------------
     */

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

    /*
     * -------------------------------------------------------
     * COMMUNITY REVIEW
     * -------------------------------------------------------
     */

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

    /*
     * -------------------------------------------------------
     * DASHBOARD
     * -------------------------------------------------------
     */

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

  if (!requireOnboarding && state.onboardingStep && state.onboardingStep !== "dashboard") {
    const onboardingPath = {
      community_selection: "/donor/onboarding/community",
      documents: "/verification/documents",
      community_review: "/donor/onboarding/review",
    }[state.onboardingStep];
    if (onboardingPath) return <Navigate to={onboardingPath} replace state={{ from: location }} />;
  }

  /*
   * ---------------------------------------------------------
   * AUTHORIZED
   * ---------------------------------------------------------
   */

  return children;
}
