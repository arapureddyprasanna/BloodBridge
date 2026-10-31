import { useNavigate } from "react-router-dom";
import "./AccessDenied.css";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <main className="access-denied-page">
      <section className="access-denied-card" aria-labelledby="access-denied-title">
        <div className="access-denied-icon" aria-hidden="true">
          403
        </div>

        <p className="access-denied-eyebrow">
          Access restricted
        </p>

        <h1 id="access-denied-title">
          You don’t have permission to view this page.
        </h1>

        <p className="access-denied-description">
          Your BloodBridge account is authenticated, but this area is
          restricted to another role or permission level.
        </p>

        <div className="access-denied-actions">
          <button
            type="button"
            className="access-denied-primary"
            onClick={() => navigate(-1)}
          >
            Go Back
          </button>

          <button
            type="button"
            className="access-denied-secondary"
            onClick={() => navigate("/", { replace: true })}
          >
            Go Home
          </button>
        </div>
      </section>
    </main>
  );
}