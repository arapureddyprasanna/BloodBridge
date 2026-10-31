import { API_BASE_URL } from "../../api";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { showToast } from "../../App";
import "./Login.css";
import { auth, googleProvider } from "../../firebase";

function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const navigate = useNavigate();

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const isStrongPassword = Object.values(passwordChecks).every(Boolean);

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "donor",
    blood_group: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "role" && value !== "donor"
        ? { blood_group: "" }
        : {}),
    }));

    if (name === "password") {
      setPassword(value);
    }

    if (name === "confirmPassword") {
      setConfirmPassword(value);
    }

    if (error) {
      setError("");
    }
  };

  const savePendingProfile = (fullName, phone, role, bloodGroup) => {
    sessionStorage.setItem(
      "bloodbridge_pending_profile",
      JSON.stringify({
        full_name: fullName,
        phone,
        role,
        ...(role === "donor" && {
          blood_group: bloodGroup,
        }),
      })
    );
  };

  const completeBloodBridgeRegistration = async (
    firebaseUser,
    fullName,
    phone,
    role,
    bloodGroup
  ) => {
    const idToken = await firebaseUser.getIdToken(true);

    const response = await fetch(
      `${API_BASE_URL}/auth/register/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          role,
          ...(role === "donor" && {
            blood_group: bloodGroup,
          }),
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail ||
          "Your BloodBridge profile could not be created."
      );
    }

    return data;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const fullName = form.full_name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!fullName || !email || !phone) {
      const message = "Please complete all required fields.";
      setError(message);
      showToast(message, "error");
      return;
    }

    if (!emailPattern.test(email)) {
      const message = "Please enter a valid email address.";
      setError(message);
      showToast(message, "error");
      return;
    }

    if (form.role === "donor" && !form.blood_group) {
      const message = "Please select your blood group.";
      setError(message);
      showToast(message, "error");
      return;
    }

    if (!isStrongPassword) {
      const message =
        "Password must meet all the security requirements.";
      setError(message);
      showToast(message, "error");
      return;
    }

    if (password !== confirmPassword) {
      const message = "Passwords do not match.";
      setError(message);
      showToast(message, "error");
      return;
    }

    setLoading(true);

    let firebaseAccountCreated = false;

    try {
      /*
       * Create the Firebase account first.
       *
       * The BloodBridge Django profile is intentionally NOT
       * created yet. It will be created after email verification.
       */
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        form.password
      );

      firebaseAccountCreated = true;

      await updateProfile(credential.user, {
        displayName: fullName,
      });

      savePendingProfile(
        fullName,
        phone,
        form.role,
        form.blood_group
      );

      await sendEmailVerification(credential.user);

      showToast(
        "Verification email sent! Please check your inbox and spam folder.",
        "success"
      );

      navigate("/verify-email", { replace: true });
    } catch (err) {
      let message =
        err.message || "Registration failed. Please try again.";

      console.error(
        "BloodBridge registration error:",
        err
      );

      /*
       * Firebase account was newly created but something after
       * creation failed.
       */
      if (firebaseAccountCreated) {
        if (err.code === "auth/too-many-requests") {
          message =
            "Too many attempts. Please try again later.";
        } else if (
          err.code === "auth/network-request-failed"
        ) {
          message =
            "Network error. Check your internet connection.";
        } else {
          message =
            "Your Firebase account was created, but registration could not finish. Please continue through email verification.";
        }

        setError(message);
        showToast(message, "error");
        return;
      }

      /*
       * Firebase says the account already exists.
       *
       * This handles the exact situation where a Firebase account
       * exists but the BloodBridge profile was never completed.
       */
      if (err.code === "auth/email-already-in-use") {
        try {
          const existingCredential =
            await signInWithEmailAndPassword(
              auth,
              email,
              form.password
            );

          const existingUser = existingCredential.user;

          savePendingProfile(
            fullName,
            phone,
            form.role,
            form.blood_group
          );

          /*
           * Existing account is not verified yet.
           * Send/re-send verification and continue normally.
           */
          if (!existingUser.emailVerified) {
            await sendEmailVerification(existingUser);

            showToast(
              "This account already exists. A verification email has been sent. Please verify your email to continue.",
              "success"
            );

            navigate("/verify-email", {
              replace: true,
            });

            return;
          }

          /*
           * Existing Firebase account is already verified.
           * Complete the missing BloodBridge profile immediately.
           */
          await completeBloodBridgeRegistration(
            existingUser,
            fullName,
            phone,
            form.role,
            form.blood_group
          );

          sessionStorage.removeItem(
            "bloodbridge_pending_profile"
          );

          showToast(
            "Your BloodBridge profile has been completed successfully.",
            "success"
          );

          await signOut(auth);

          navigate("/login", {
            replace: true,
          });

          return;
        } catch (recoveryError) {
          console.error(
            "Existing Firebase account recovery failed:",
            recoveryError
          );

          if (
            recoveryError.code ===
              "auth/invalid-credential" ||
            recoveryError.code === "auth/wrong-password" ||
            recoveryError.code === "auth/user-not-found"
          ) {
            message =
              "This email already has a Firebase account, but the password does not match. Please use the correct password.";
          } else if (
            recoveryError.code === "auth/too-many-requests"
          ) {
            message =
              "Too many attempts. Please try again later.";
          } else if (
            recoveryError.code ===
            "auth/network-request-failed"
          ) {
            message =
              "Network error. Check your internet connection.";
          } else {
            message =
              recoveryError.message ||
              "The existing Firebase account could not be recovered.";
          }

          setError(message);
          showToast(message, "error");
          return;
        }
      }

      if (err.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (err.code === "auth/weak-password") {
        message = "Choose a stronger password.";
      } else if (
        err.code === "auth/network-request-failed"
      ) {
        message =
          "Network error. Check your internet connection.";
      } else if (
        err.code === "auth/too-many-requests"
      ) {
        message =
          "Too many attempts. Please try again later.";
      }

      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError("");

    const phone = form.phone.trim();

    if (!phone) {
      const message =
        "Please enter your phone number before continuing with Google.";
      setError(message);
      showToast(message, "error");
      return;
    }

    if (form.role === "donor" && !form.blood_group) {
      const message = "Please select your blood group.";
      setError(message);
      showToast(message, "error");
      return;
    }

    try {
      /*
       * Google accounts are already authenticated by Google,
       * so they do not need the email/password verification
       * waiting flow.
       */
      const result = await signInWithPopup(
        auth,
        googleProvider
      );

      const user = result.user;

      const idToken = await user.getIdToken();

      /*
       * Check whether this Google account already has a
       * BloodBridge profile.
       */
      const meResponse = await fetch(
        `${API_BASE_URL}/auth/me/`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      if (meResponse.ok) {
        showToast(
          "This account already exists. Please sign in instead.",
          "error"
        );

        await signOut(auth);

        navigate("/login", {
          replace: true,
        });

        return;
      }

      if (meResponse.status !== 404) {
        const errorData = await meResponse
          .json()
          .catch(() => ({}));

        throw new Error(
          errorData.detail ||
            "Unable to check your existing profile."
        );
      }

      /*
       * No BloodBridge profile exists, so create it.
       */
      const response = await fetch(
        `${API_BASE_URL}/auth/register/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            full_name: user.displayName || "",
            phone,
            role: form.role,
            ...(form.role === "donor" && {
              blood_group: form.blood_group,
            }),
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Google registration could not be completed."
        );
      }

      showToast(
        "Google account registered. Your profile is pending verification.",
        "success"
      );

      await signOut(auth);

      navigate("/login", {
        replace: true,
      });
    } catch (error) {
      await signOut(auth).catch(() => {});

      const message =
        error.message ||
        "Google registration failed. Please try again.";

      setError(message);
      showToast(message, "error");
    }
  };

  return (
    <main className="login-page register-page">
      <section className="login-form-side">
        <Link to="/" className="login-brand">
          <span
            className="brand-drop"
            aria-hidden="true"
          >
            ♥
          </span>

          <span>BloodBridge</span>
        </Link>

        <div className="login-form-content">
          <span className="login-eyebrow">
            JOIN BLOODBRIDGE
          </span>

          <h1>Create your account.</h1>

          <p className="login-description">
            Join a community connecting blood donors with
            people who need them. Every connection can make a
            difference.
          </p>

          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <label htmlFor="register-full-name">
              Full name
            </label>

            <input
              id="register-full-name"
              name="full_name"
              type="text"
              placeholder="Enter your full name"
              autoComplete="name"
              value={form.full_name}
              onChange={handleChange}
              required
              disabled={loading}
            />

            <label htmlFor="register-email">
              Email address
            </label>

            <input
              id="register-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              disabled={loading}
            />

            <label htmlFor="register-phone">
              Mobile number
            </label>

            <input
              id="register-phone"
              name="phone"
              type="tel"
              placeholder="Enter your mobile number"
              autoComplete="tel"
              value={form.phone}
              onChange={handleChange}
              required
              disabled={loading}
            />

            <label>I want to join as</label>

            <div className="role-options">
              {[
                {
                  value: "donor",
                  label: "Donor",
                  icon: "🩸",
                },
                {
                  value: "community_admin",
                  label: "Community",
                  icon: "👥",
                },
                {
                  value: "hospital_admin",
                  label: "Hospital",
                  icon: "🏥",
                },
              ].map((role) => (
                <label
                  key={role.value}
                  className={`role-option ${
                    form.role === role.value
                      ? "selected"
                      : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={
                      form.role === role.value
                    }
                    onChange={handleChange}
                    disabled={loading}
                  />

                  <span className="role-icon">
                    {role.icon}
                  </span>

                  <span>{role.label}</span>
                </label>
              ))}
            </div>

            {form.role === "donor" && (
              <>
                <label htmlFor="register-blood-group">
                  Blood group
                </label>

                <select
                  id="register-blood-group"
                  name="blood_group"
                  value={form.blood_group}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="login-input"
                >
                  <option value="">
                    Select your blood group
                  </option>

                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </>
            )}

            {/* Password */}
            <div className="password-field">
              <label htmlFor="register-password">
                Password
              </label>

              <div className="password-input-wrap">
                <input
                  id="register-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) => {
                    const value =
                      e.target.value;

                    setPassword(value);

                    setForm((previous) => ({
                      ...previous,
                      password: value,
                    }));
                  }}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  required
                  className="login-input"
                />

                <button
                  type="button"
                  className="password-toggle-btn"
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
                  aria-pressed={showPassword}
                >
                  {showPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>

              <div
                className="password-rules"
                aria-live="polite"
              >
                <p>Password requirements:</p>

                {[
                  [
                    "length",
                    "At least 8 characters",
                  ],
                  [
                    "uppercase",
                    "One uppercase letter (A–Z)",
                  ],
                  [
                    "lowercase",
                    "One lowercase letter (a–z)",
                  ],
                  [
                    "number",
                    "One number (0–9)",
                  ],
                  [
                    "special",
                    "One special character (!@#$...)",
                  ],
                ].map(([rule, label]) => (
                  <div
                    key={rule}
                    className={`password-rule ${
                      passwordChecks[rule]
                        ? "rule-valid"
                        : ""
                    }`}
                  >
                    <span>
                      {passwordChecks[rule]
                        ? "✓"
                        : "○"}
                    </span>

                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm Password */}
            <div className="password-field">
              <label htmlFor="register-confirm-password">
                Confirm Password
              </label>

              <div className="password-input-wrap">
                <input
                  id="register-confirm-password"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={confirmPassword}
                  onChange={(e) => {
                    const value =
                      e.target.value;

                    setConfirmPassword(value);

                    setForm((previous) => ({
                      ...previous,
                      confirmPassword: value,
                    }));
                  }}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                  className="login-input"
                />

                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() =>
                    setShowConfirmPassword(
                      (previous) => !previous
                    )
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  aria-pressed={
                    showConfirmPassword
                  }
                >
                  {showConfirmPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <p
                  className={`password-match ${
                    passwordsMatch
                      ? "rule-valid"
                      : "rule-invalid"
                  }`}
                >
                  {passwordsMatch
                    ? "✓ Passwords match"
                    : "✗ Passwords do not match"}
                </p>
              )}
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
                ? "Creating account..."
                : "Create account"}

              {!loading && (
                <span aria-hidden="true">
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
              onClick={handleGoogleRegister}
              disabled={loading}
            >
              Continue with Google
            </button>
          </div>

          <p className="login-register-prompt">
            Already have an account?{" "}
            <Link to="/login">
              Sign in
            </Link>
          </p>

          <p className="login-privacy-note">
            Your information is used to coordinate blood
            donation securely. Hospital and community
            accounts require verification.
          </p>
        </div>

        <p className="login-copyright">
          © {new Date().getFullYear()} BloodBridge
        </p>
      </section>

      <aside className="login-visual-side">
        <div className="login-visual-frame">
          <div className="visual-heading">
            <span className="visual-kicker">
              ONE COMMUNITY. MANY LIVES.
            </span>

            <h2>
              Be the reason
              <br />
              someone gets another chance.
            </h2>

            <p>
              A trusted connection between donors,
              communities, and hospitals.
            </p>
          </div>

          <div
            className="blood-drop-scene"
            aria-hidden="true"
          >
            <div className="drop-orbit orbit-one" />
            <div className="drop-orbit orbit-two" />
            <div className="drop-orbit orbit-three" />

            <div className="floating-info-card info-card-one">
              <span className="info-card-icon">
                ♥
              </span>

              <div>
                <h3>Every Drop Counts</h3>
                <p>
                  Your donation can save lives.
                </p>
              </div>
            </div>

            <div className="floating-info-card info-card-two">
              <span className="info-card-icon">
                ✓
              </span>

              <div>
                <h3>Trusted Connections</h3>
                <p>
                  Connecting donors and hospitals.
                </p>
              </div>
            </div>

            <div className="floating-info-card info-card-three">
              <span className="info-card-icon">
                ♧
              </span>

              <div>
                <h3>Stronger Together</h3>
                <p>
                  Communities making a difference.
                </p>
              </div>

              <div className="floating-info-card info-card-four">
                <span className="info-card-icon">
                  ⌖
                </span>

                <div>
                  <h3>Find Nearby Donors</h3>
                  <p>
                    Connect through
                    location-based matching.
                  </p>
                </div>
              </div>

              <div className="floating-info-card info-card-five">
                <span className="info-card-icon">
                  ♡
                </span>

                <div>
                  <h3>Every Life Matters</h3>
                  <p>
                    One community, one
                    lifesaving mission.
                  </p>
                </div>
              </div>
            </div>

            <div className="main-blood-drop">
              <svg
                className="blood-drop-svg"
                viewBox="0 0 160 200"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient
                    id="registerBloodGradient"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#f77f8b"
                    />

                    <stop
                      offset="55%"
                      stopColor="#a93443"
                    />

                    <stop
                      offset="100%"
                      stopColor="#641923"
                    />
                  </linearGradient>
                </defs>

                <path
                  d="M80 8 C65 36 20 87 20 125 C20 163 46 190 80 190 C114 190 140 163 140 125 C140 87 95 36 80 8Z"
                  fill="url(#registerBloodGradient)"
                />

                <path
                  d="M53 91 C42 111 40 127 48 140"
                  fill="none"
                  stroke="#fffcfc"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity="0.45"
                />
              </svg>
            </div>
          </div>

          <div className="visual-footer">
            <span className="visual-footer-dot" />

            <span>
              Every donor matters. Every connection
              counts.
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}

export default Register;