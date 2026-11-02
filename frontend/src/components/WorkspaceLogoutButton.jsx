import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { auth } from "../firebase";

export default function WorkspaceLogoutButton({ onLogout, className = "bb-admin-nav-link" }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!showConfirm) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        setShowConfirm(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirm, busy]);

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleCancel = () => {
    if (busy) return;
    setShowConfirm(false);
  };

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await auth.signOut();
      setShowConfirm(false);
      onLogout?.();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      toast.error("Unable to sign out. Please try again.");
      setBusy(false);
    }
  };

  return (
    <>

      <button
        type="button"
        className={className}
        onClick={handleOpenConfirm}
        disabled={busy}
        aria-haspopup="dialog"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          marginTop: "12px",
          transition: "all 0.2s ease",
          backgroundColor: hovered ? "black" : "rgba(251, 111, 111, 0.99)",
          color: hovered ? "#FFFFFF" : "#52171f",
          transform: hovered ? "translateY(-1px)" : "translateY(0)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            color: hovered ? "#FFFFFF" : "#7A1F2B",
            fontWeight: 800,
            transition: "color 0.2s ease",
          }}
        >
          ↪
        </span>

        <span>Logout</span>
      </button>

      {showConfirm && (
        <div
          className="bb-logout-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              handleCancel();
            }
          }}
        >
          <div
            className="bb-logout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bb-logout-modal-title"
            aria-describedby="bb-logout-modal-desc"
          >
            <div className="bb-logout-modal-icon-wrap" aria-hidden="true">
              <span className="bb-logout-modal-icon">↪</span>
            </div>

            <div className="bb-logout-modal-body">
              <h2 id="bb-logout-modal-title">Confirm Logout</h2>
              <p id="bb-logout-modal-desc">
                Are you sure you want to logout? You will need to sign in again to access your BloodBridge workspace.
              </p>
            </div>

            <div className="bb-logout-modal-actions">
              <button
                type="button"
                className="bb-logout-modal-btn bb-logout-modal-btn--cancel"
                onClick={handleCancel}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bb-logout-modal-btn bb-logout-modal-btn--confirm"
                onClick={logout}
                disabled={busy}
                autoFocus
              >
                {busy ? "Signing out…" : "Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
