import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import "./Login.css";

function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);

  const checkingRef = useRef(false);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);

  const finishVerification = useCallback(
    async (currentUser) => {
      if (
        !currentUser ||
        checkingRef.current ||
        completedRef.current
      ) {
        return;
      }

      checkingRef.current = true;

      if (mountedRef.current) {
        setChecking(true);
      }

      try {
        await currentUser.reload();

        const refreshedUser = auth.currentUser;

        if (!refreshedUser) {
          return;
        }

        /*
         * =====================================================
         * EMAIL NOT VERIFIED
         * =====================================================
         *
         * Stay on this page.
         *
         * DO NOT:
         * - call /auth/me/
         * - call /auth/register/
         * - open verification documents
         * - redirect to login
         */
        if (refreshedUser.emailVerified !== true) {
          showToast(
            "Your email is not verified yet. Please verify it first.",
            "error"
          );

          return;
        }

        /*
         * =====================================================
         * EMAIL IS VERIFIED
         * =====================================================
         *
         * Only now do we obtain the refreshed Firebase token
         * and communicate with Django.
         */
        const idToken =
          await refreshedUser.getIdToken(true);

        const savedProfile =
          sessionStorage.getItem(
            "bloodbridge_pending_profile"
          );

        /*
         * If there is no pending registration data, check
         * whether the BloodBridge profile already exists.
         */
        if (!savedProfile) {
          const meResponse = await fetch(
            `${API_BASE_URL}/auth/me/`,
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (meResponse.ok) {
            completedRef.current = true;

            showToast(
              "Email verified successfully! You can now sign in.",
              "success"
            );

            await signOut(auth);

            navigate("/login", {
              replace: true,
            });

            return;
          }

          throw new Error(
            "Your registration details could not be recovered. Please register again."
          );
        }

        let profile;

        try {
          profile = JSON.parse(savedProfile);
        } catch {
          throw new Error(
            "Your saved registration details are invalid. Please register again."
          );
        }

        /*
         * =====================================================
         * CREATE BLOODBRIDGE PROFILE
         * =====================================================
         *
         * This is ONLY possible because emailVerified === true.
         */
        const response = await fetch(
          `${API_BASE_URL}/auth/register/`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(profile),
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.detail ||
              "Your email is verified, but your BloodBridge profile could not be created."
          );
        }

        completedRef.current = true;

        sessionStorage.removeItem(
          "bloodbridge_pending_profile"
        );

        showToast(
          "Email verified successfully! You can now sign in.",
          "success"
        );

        await signOut(auth);

        navigate("/login", {
          replace: true,
        });
      } catch (error) {
        console.error(
          "Email verification completion failed:",
          error
        );

        showToast(
          error.message ||
            "Unable to complete registration. Please try again.",
          "error"
        );
      } finally {
        checkingRef.current = false;

        if (mountedRef.current) {
          setChecking(false);
        }
      }
    },
    [navigate]
  );

  useEffect(() => {
    mountedRef.current = true;

    /*
     * Check the current Firebase session once when this page
     * opens.
     */
    const currentUser = auth.currentUser;

    if (currentUser) {
      setUser(currentUser);
      finishVerification(currentUser);
    } else {
      /*
       * We do NOT immediately redirect.
       *
       * The auth state listener gets a chance to resolve.
       */
      setChecking(true);
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (!mountedRef.current) return;

        setUser(currentUser);

        if (!currentUser) {
          /*
           * Only redirect if this page was entered without
           * an authenticated Firebase account.
           *
           * Do NOT redirect because another component just
           * signed the user out after completing registration.
           */
          if (
            location.state?.emailVerificationRequired
          ) {
            setChecking(false);
            return;
          }

          setChecking(false);
          return;
        }

        finishVerification(currentUser);
      }
    );

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        auth.currentUser
      ) {
        finishVerification(auth.currentUser);
      }
    };

    const intervalId = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        auth.currentUser
      ) {
        finishVerification(auth.currentUser);
      }
    }, 40000);

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      mountedRef.current = false;

      unsubscribe();
      clearInterval(intervalId);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [finishVerification, location.state]);

  const checkVerification = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      showToast(
        "Your verification session has expired. Please register again.",
        "error"
      );

      navigate("/register", {
        replace: true,
      });

      return;
    }

    await finishVerification(currentUser);
  };

  const resendEmail = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      showToast(
        "Your verification session has expired. Please register again.",
        "error"
      );

      navigate("/register", {
        replace: true,
      });

      return;
    }

    try {
      setSending(true);

      await sendEmailVerification(currentUser);

      showToast(
        "Verification email sent. Check your inbox and spam folder.",
        "success"
      );
    } catch (error) {
      console.error(
        "Resend verification failed:",
        error
      );

      let message =
        "Could not resend the verification email.";

      if (
        error.code === "auth/too-many-requests"
      ) {
        message =
          "Too many attempts. Please try again later.";
      } else if (
        error.code === "auth/network-request-failed"
      ) {
        message =
          "Network error. Check your internet connection.";
      } else if (
        error.code === "auth/invalid-continue-uri"
      ) {
        message =
          "The verification link configuration is invalid. Check Firebase settings.";
      } else if (error.message) {
        message = error.message;
      }

      showToast(message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="email-verification-page">
      <section className="email-verification-card">
        <div className="email-verification-icon">
          ✉
        </div>

        <h1>Verify your email</h1>

        <p>
          Check your inbox for a verification link. If you
          cannot find it, check your spam folder or request
          another email below.
        </p>

        <p className="verification-email">
          {user?.email || "Loading your account..."}
        </p>

        <p>
          After clicking the verification link, return here
          and select the button below.
        </p>

        <button
          type="button"
          onClick={checkVerification}
          disabled={checking || !user}
        >
          {checking
            ? "Checking..."
            : "I've verified my email"}
        </button>

        <button
          type="button"
          className="verification-secondary-button"
          onClick={resendEmail}
          disabled={sending || !user}
        >
          {sending
            ? "Sending..."
            : "Resend verification email"}
        </button>

        <button
          type="button"
          className="verification-link-button"
          onClick={async () => {
            await signOut(auth);

            navigate("/login", {
              replace: true,
            });
          }}
        >
          Back to login
        </button>
      </section>
    </main>
  );
}

export default EmailVerification;