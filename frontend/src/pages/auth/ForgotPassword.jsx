
import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import "./ForgotPassword.css";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      showToast("Please enter your email address.", "error");
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);

      setSubmitted(true);
      showToast("If an account exists for this email, a reset link will be sent.", "success");
    } catch (error) {
      console.error("Password reset request failed:", error.code);

      if (error.code === "auth/invalid-email") {
        showToast("Please enter a valid email address.", "error");
      } else if (error.code === "auth/too-many-requests") {
        showToast("Too many attempts. Please try again later.", "error");
      } else if (error.code === "auth/network-request-failed") {
        showToast("Network error. Check your internet connection.", "error");
      } else if (error.code === "auth/user-not-found") {
        // Keep the message neutral to avoid revealing registered emails.
        setSubmitted(true);
        showToast(
          "If an account exists for this email, a reset link will be sent.",
          "success"
        );
      } else {
        showToast("Unable to process the request. Please try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="forgot-page">
      <section className="forgot-card">
        <Link to="/" className="forgot-brand">
          <span className="forgot-brand-icon">♥</span>
          <span>BloodBridge</span>
        </Link>

        <div className="forgot-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>

        {!submitted ? (
          <>
            <p className="forgot-eyebrow">ACCOUNT RECOVERY</p>
            <h1>Forgot your password?</h1>
            <p className="forgot-description">
              No worries. Enter the email address associated with your
              BloodBridge account and we'll send you a password reset link.
            </p>

            <form onSubmit={handleSubmit} className="forgot-form">
              <label htmlFor="reset-email">Email address</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <button type="submit" disabled={loading}>
                {loading ? "Sending reset link..." : "Send reset link"}
              </button>
            </form>
          </>
        ) : (
          <div className="forgot-success">
            <p className="forgot-eyebrow">CHECK YOUR INBOX</p>
            <h1>Check your email</h1>
            <p className="forgot-description">
              If a BloodBridge account exists for <strong>{email.trim()}</strong>,
              you'll receive a password reset link. Check your spam folder too.
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="forgot-secondary"
            >
              Try another email
            </button>
          </div>
        )}

        <div className="forgot-back">
          Remember your password? <Link to="/login">Back to login</Link>
        </div>

        <p className="forgot-security">
          Your account security matters. Never share your reset link with anyone.
        </p>
      </section>
    </main>
  );
}

export default ForgotPassword;
