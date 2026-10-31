import { API_BASE_URL } from "../../api";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import "./Login.css";
import toast from "react-hot-toast";
import { showToast } from "../../App";

function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  /*
   * Complete login only after Firebase authentication
   * has passed all required checks.
   */
  async function completeLogin(user) {
    try {
      const currentUser = auth.currentUser || user;

      if (!currentUser) {
        throw new Error(
          "Your Firebase session could not be found."
        );
      }

      await currentUser.reload();

      const refreshedUser = auth.currentUser;

      if (!refreshedUser) {
        throw new Error(
          "Your Firebase session could not be found."
        );
      }

      const isPasswordUser =
        refreshedUser.providerData.some(
          (provider) =>
            provider.providerId === "password"
        );

      /*
       * =====================================================
       * FIREBASE EMAIL VERIFICATION
       * =====================================================
       */
      if (
        isPasswordUser &&
        refreshedUser.emailVerified !== true
      ) {
        try {
          await sendEmailVerification(refreshedUser);
        } catch (verificationError) {
          console.error(
            "Verification email could not be sent:",
            verificationError
          );
        }

        const unverifiedEmail =
          refreshedUser.email || email.trim();

        setError("");

        showToast(
          "Please verify your email before signing in. A new verification email has been sent.",
          "error"
        );

        navigate("/register", {
          replace: true,
          state: {
            email: unverifiedEmail,
            emailVerificationRequired: true,
          },
        });

        return {
          unverified: true,
        };
      }

      /*
       * =====================================================
       * BLOODBRIDGE ACCOUNT
       * =====================================================
       */
      const idToken =
        await refreshedUser.getIdToken(true);

      const meResponse = await fetch(
        `${API_BASE_URL}/auth/me/`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const meData = await meResponse
        .json()
        .catch(() => ({}));

      if (meResponse.status === 404) {
        await signOut(auth);

        throw new Error(
          "Your BloodBridge profile was not found. Please register first."
        );
      }

      if (!meResponse.ok) {
        throw new Error(
          meData.detail ||
          "Unable to verify your BloodBridge account."
        );
      }

      const role = meData.role;

      const accountStatus =
        meData.account_status || meData.status;

      /*
       * =====================================================
       * SUPER ADMIN
       * =====================================================
       */
      if (role === "super_admin") {
        showToast(
          "Signed in successfully!",
          "success"
        );

        navigate("/admin", {
          replace: true,
        });

        return;
      }

      /*
       * =====================================================
       * SUSPENDED
       * =====================================================
       */
      if (accountStatus === "suspended") {
        await signOut(auth);

        throw new Error(
          "Your account is suspended. Please contact support."
        );
      }

      /*
       * =====================================================
       * DONOR ROUTING
       * =====================================================
       *
       * IMPORTANT:
       *
       * Donors use the donor onboarding state machine.
       *
       * Do NOT call /auth/verification/ for donors.
       *
       * The backend's next_step is the single source
       * of truth for donor onboarding.
       */
      if (role === "donor") {
        const onboardingResponse = await fetch(
          `${API_BASE_URL}/communities/onboarding/status/`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
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

        /*
         * ===================================================
         * DONOR ONBOARDING STATE MACHINE
         * ===================================================
         *
         * next_step determines the correct destination.
         */
        const donorRoutes = {
          community_selection:
            "/donor/onboarding/community",

          documents:
            "/verification/documents",

          community_review:
            "/donor/onboarding/review",

          dashboard:
            "/donor/dashboard",
        };

        console.log(
          "DONOR ONBOARDING RESPONSE:",
          onboardingData
        );

        const destination =
          donorRoutes[onboardingData.next_step] ||
          "/donor/onboarding/community";

        /*
         * Only show a successful sign-in toast once.
         */
        showToast(
          "Signed in successfully!",
          "success"
        );

        navigate(destination, {
          replace: true,
        });

        return;
      }

      /*
       * =====================================================
       * VERIFICATION STATUS
       * =====================================================
       *
       * This generic verification flow is ONLY for
       * hospital/community accounts.
       */
      const verificationResponse =
        await fetch(
          `${API_BASE_URL}/auth/verification/`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
          }
        );

      const verificationData =
        await verificationResponse
          .json()
          .catch(() => ({}));

      if (!verificationResponse.ok) {
        throw new Error(
          verificationData.detail ||
          "Unable to check your verification status."
        );
      }

      const verification =
        verificationData.verification || {};

      const verificationStatus =
        verification.status;

      /*
       * =====================================================
       * NON-DONOR ACCOUNT ROUTING
       * =====================================================
       */

      /*
       * Approved hospital/community admins.
       */
      if (
        verificationStatus === "approved" &&
        accountStatus === "active"
      ) {
        const dashboardRoutes = {
          hospital_admin: "/dashboard",
          community_admin: "/community",
        };

        const destination =
          dashboardRoutes[role];

        if (!destination) {
          await signOut(auth);

          throw new Error(
            "Your account has an invalid role. Please contact support."
          );
        }

        showToast(
          "Signed in successfully!",
          "success"
        );

        navigate(destination, {
          replace: true,
        });

        return;
      }

      /*
       * =====================================================
       * REJECTED
       * =====================================================
       */
      if (accountStatus === "rejected") {
        showToast(
          "Your application needs attention before you can continue.",
          "error"
        );

        navigate(
          "/verification/documents",
          {
            replace: true,
            state: {
              rejected: true,
              rejectionReason:
                verification.rejection_reason ||
                "",
            },
          }
        );

        return;
      }

      /*
       * =====================================================
       * SUBMITTED / UNDER REVIEW
       * =====================================================
       */
      if (
        verificationStatus === "submitted" ||
        verificationStatus === "under_review"
      ) {
        showToast(
          "Your verification is under review.",
          "success"
        );

        navigate(
          "/verification/pending",
          {
            replace: true,
          }
        );

        return;
      }

      /*
       * =====================================================
       * NON-DONOR DRAFT / PENDING
       * =====================================================
       */
      if (
        verificationStatus === "draft" ||
        accountStatus === "pending"
      ) {
        navigate(
          "/verification/documents",
          {
            replace: true,
          }
        );

        return;
      }

      /*
       * =====================================================
       * SAFE FALLBACK
       * =====================================================
       */
      navigate(
        "/verification/documents",
        {
          replace: true,
        }
      );
    } catch (err) {
      throw err;
    }
  }

  async function handleEmailLogin(event) {
    event.preventDefault();

    setError("");
    setLoading(true);
    toast.dismiss();

    try {
      await setPersistence(
        auth,
        browserSessionPersistence
      );

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      /*
       * completeLogin performs the mandatory Firebase
       * email-verification gate before calling the backend.
       */
      const result = await completeLogin(
        credential.user
      );

      /*
       * Unverified users have already been:
       *
       * - signed out
       * - shown a toast
       * - redirected to /register
       *
       * So do not show another error toast.
       */
      if (result?.unverified) {
        return;
      }
    } catch (err) {
      const message = err.code
        ? getAuthErrorMessage(err.code)
        : err.message ||
        "Sign-in failed. Please try again.";

      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    toast.dismiss();

    try {
      await setPersistence(
        auth,
        browserSessionPersistence
      );

      const result =
        await signInWithPopup(
          auth,
          googleProvider
        );

      await completeLogin(result.user);
    } catch (err) {
      const message = err.code
        ? getAuthErrorMessage(err.code)
        : err.message ||
        "Sign-in failed. Please try again.";

      setError(message);
      showToast(message, "error");

      console.error(
        "Google Sign-In error:",
        err
      );
    } finally {
      setLoading(false);
    }
  }

  function getAuthErrorMessage(code) {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password. Please try again.";

      case "auth/invalid-email":
        return "Enter a valid email address.";

      case "auth/popup-closed-by-user":
        return "Google sign-in was cancelled.";

      case "auth/popup-blocked":
        return "Your browser blocked the Google sign-in popup.";

      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";

      case "auth/network-request-failed":
        return "Network error. Check your internet connection.";

      default:
        return "Sign-in failed. Please try again.";
    }
  }

  return (
    <main className="login-page">
      <section className="login-form-side">
        <Link to="/" className="login-brand">
          <span className="brand-drop">♥</span>
          <span>BloodBridge</span>
        </Link>

        <div className="login-form-content">
          <span className="login-eyebrow">
            WELCOME BACK
          </span>

          <h1>
            Every second
            <br />
            can save a life.
          </h1>

          <p className="login-description">
            Sign in to connect with your community and make
            a difference when it matters most.
          </p>

          <form
            className="login-form"
            onSubmit={handleEmailLogin}
          >
            <label htmlFor="login-email">
              Email address
            </label>

            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />

            <div className="login-password-heading">
              <label htmlFor="login-password">
                Password
              </label>

              <Link
                to="/forgot-password"
                className="forgot-password"
              >
                Forgot password?
              </Link>
            </div>

            <div className="login-password-field">
              <input
                id="login-password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(
                    (previous) => !previous
                  )
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showPassword
                  ? "Hide"
                  : "Show"}
              </button>
            </div>

            {error && (
              <p
                className="login-error"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign in to BloodBridge"}

              {!loading && (
                <span aria-hidden="true">
                  {" "}
                  →
                </span>
              )}
            </button>
          </form>

          <div className="login-google-section">
            <p>Or continue with</p>

            <button
              type="button"
              className="login-google-button"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              Continue with Google
            </button>
          </div>

          <p className="login-register-prompt">
            New to BloodBridge?{" "}
            <Link to="/register">
              Create an account
            </Link>
          </p>

          <p className="login-privacy-note">
            Your account and personal information deserve
            protection.
          </p>
        </div>

        <p className="login-copyright">
          © 2026 BloodBridge · Every drop matters.
        </p>
      </section>

      <section className="login-visual-side">
        <div className="login-visual-frame">
          <div className="visual-heading">
            <span className="visual-kicker">
              ONE COMMUNITY. COUNTLESS LIVES.
            </span>

            <h2>
              Small act.
              <br />
              Extraordinary impact.
            </h2>

            <p>
              Bringing donors, hospitals and communities
              together, one connection at a time.
            </p>
          </div>

          <div
            className="blood-drop-scene"
            aria-label="BloodBridge donation illustration"
          >
            <div className="drop-orbit orbit-one" />
            <div className="drop-orbit orbit-two" />
            <div className="drop-orbit orbit-three" />

            <div
              className="drop-rays"
              aria-hidden="true"
            >
              {Array.from(
                { length: 20 },
                (_, index) => (
                  <span
                    className="drop-ray"
                    key={index}
                    style={{
                      "--ray-index": index,
                    }}
                  />
                )
              )}
            </div>

            <div className="main-blood-drop">
              <svg
                viewBox="0 0 160 200"
                role="img"
                aria-label="Red blood drop"
                className="blood-drop-svg"
              >
                <defs>
                  <linearGradient
                    id="bloodDropGradient"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#B83D4A"
                    />

                    <stop
                      offset="100%"
                      stopColor="#721724"
                    />
                  </linearGradient>
                </defs>

                <path
                  d="M80 8 C66 35 20 83 20 124 C20 161 46 188 80 188 C114 188 140 161 140 124 C140 83 94 35 80 8Z"
                  fill="url(#bloodDropGradient)"
                />

                <path
                  d="M49 112 C51 91 63 72 76 57"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity=".55"
                />

                <circle
                  cx="50"
                  cy="143"
                  r="5"
                  fill="#FFFFFF"
                  opacity=".75"
                />

                <circle
                  cx="65"
                  cy="156"
                  r="3"
                  fill="#FFFFFF"
                  opacity=".5"
                />
              </svg>
            </div>

            <div className="floating-info-card info-card-one">
              <span className="info-card-icon">
                ♡
              </span>

              <div>
                <h3>Every donor matters</h3>
                <p>
                  Your generosity brings hope.
                </p>
              </div>
            </div>

            <div className="floating-info-card info-card-two">
              <span className="info-card-icon">
                ✓
              </span>

              <div>
                <h3>Faster connections</h3>
                <p>
                  Help reaches those in need.
                </p>
              </div>
            </div>

            <div className="floating-info-card info-card-three">
              <span className="info-card-icon">
                ⌖
              </span>

              <div>
                <h3>Stronger communities</h3>
                <p>
                  Goodness grows together.
                </p>
              </div>
            </div>
          </div>

          <div className="visual-footer">
            <span className="visual-footer-dot" />

            <span>
              Connecting kindness with urgent needs.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Login;