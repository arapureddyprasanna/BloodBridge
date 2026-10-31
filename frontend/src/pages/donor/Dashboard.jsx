import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import {
  EmptyState,
  LoadingState,
  PrivacyNoticeBox,
  RequestCard,
} from "./DonorComponents";
import "./DonorWorkspace.css";

export default function DonorDashboard() {
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;

      if (!user) {
        setProfile(null);
        setRequests([]);
        return;
      }

      const token = await user.getIdToken();

      const [profileResponse, invitationsResponse] =
        await Promise.all([
          fetch(`${API_BASE_URL}/auth/me/`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
          fetch(`${API_BASE_URL}/donor/requests/`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
        ]);

      if (!profileResponse.ok) {
        throw new Error("Unable to load donor profile.");
      }

      if (!invitationsResponse.ok) {
        const errorData = await invitationsResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || "Unable to load donor invitations.");
      }

      const profileData = await profileResponse.json();
      const invitationsData = await invitationsResponse.json();

      setProfile(profileData);

      setRequests(Array.isArray(invitationsData?.results) ? invitationsData.results.slice(0, 3) : []);
    } catch (error) {
      console.error("Donor dashboard load failed:", error);

      showToast(
        error.message || "Unable to load donor dashboard.",
        "error"
      );

      setProfile(null);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const respondToInvitation = async (invitation, decision) => {
    const user = auth.currentUser;
    if (!user) {
      showToast("Please sign in again to continue.", "error");
      return;
    }
    setRespondingId(invitation.invitation_id);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/donor/requests/${invitation.blood_request_id}/${decision}/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Unable to ${decision} this invitation.`);
      showToast(data.detail || "Invitation response saved.");
      await loadDashboard();
    } catch (error) {
      showToast(error.message || "Unable to save your response.", "error");
    } finally {
      setRespondingId(null);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const accountStatus = useMemo(() => {
    if (!profile) return "Unavailable";

    if (profile.status === "active") return "Active donor";
    if (profile.status === "pending") return "Verification pending";
    if (profile.status === "rejected") return "Verification declined";
    if (profile.status === "suspended") return "Account suspended";

    return "Profile active";
  }, [profile]);

  const donorName =
    profile?.full_name ||
    profile?.display_name ||
    "Donor";

  const donorCity =
    profile?.city ||
    profile?.donor_profile?.city ||
    "City not shared";

  const donorGroup =
    profile?.blood_group ||
    profile?.donor_profile?.blood_group ||
    "Blood group not set";

  const isAvailable =
    profile?.donor_profile?.is_available !== false;

  if (loading) {
    return <LoadingState message="Loading donor dashboard..." />;
  }

  return (
    <div className="bb-page-shell">
      {/* =================================================
          WELCOME
      ================================================== */}
      <section className="bb-hero-card">
        <div className="bb-hero-copy">
          <span className="bb-hero-eyebrow">
            Donor workspace
          </span>

          <h1 className="bb-hero-title">
            Welcome back, {donorName}
          </h1>

          <p className="bb-hero-description">
            Stay ready to help when your blood type is needed.
            Your donor activity and invitations appear here.
          </p>
        </div>

        <div className="bb-hero-action">
          <Link
            to="/donor/availability"
            className="bb-primary-button"
          >
            Manage availability
          </Link>
        </div>
      </section>

      {/* =================================================
          AVAILABILITY
      ================================================== */}
      <section className="bb-status-panel">
        <div className="bb-status-icon" aria-hidden="true" />

        <div className="bb-status-content">
          <strong>
            {isAvailable
              ? "Available to coordinate"
              : "Availability is paused"}
          </strong>

          <p>
            {isAvailable
              ? "Your profile can be considered for eligible donor matching."
              : "Hospitals will not consider you for new matching until you update your availability."}
          </p>
        </div>

        <div className="bb-status-action">
          <Link
            to="/donor/availability"
            className="bb-text-button"
          >
            Update
          </Link>
        </div>
      </section>

      {/* =================================================
          PROFILE SUMMARY
      ================================================== */}
      <section className="bb-stat-grid">
        <article className="bb-stat-card">
          <p className="bb-stat-label">Blood group</p>

          <p className="bb-stat-value">{donorGroup}</p>

          <p className="bb-stat-meta">
            Your registered donor type
          </p>
        </article>

        <article className="bb-stat-card">
          <p className="bb-stat-label">Account</p>

          <p className="bb-stat-value">{accountStatus}</p>

          <p className="bb-stat-meta">
            Secure donor access
          </p>
        </article>

        <article className="bb-stat-card">
          <p className="bb-stat-label">Location</p>

          <p className="bb-stat-value">{donorCity}</p>

          <p className="bb-stat-meta">
            Shared according to your privacy settings
          </p>
        </article>
      </section>

      {/* =================================================
          MAIN CONTENT
      ================================================== */}
      <section className="bb-grid bb-grid--two">
        {/* -------------------------------------------------
            REQUESTS
        -------------------------------------------------- */}
        <section className="bb-card">
          <div className="bb-section-header">
            <div className="bb-section-heading">
              <span className="bb-card-eyebrow">
                Your matches
              </span>

              <h2 className="bb-section-title">
                Requests for you
              </h2>

              <p className="bb-section-description">
                Invitations and eligible requests available
                through your donor workspace.
              </p>
            </div>

            <Link
              to="/donor/requests"
              className="bb-text-button"
            >
              View all
            </Link>
          </div>

          {requests.length ? (
            <div className="bb-request-list">
              {requests.map((request) => (
                <RequestCard
                  key={request.invitation_id}
                  request={request}
                  onAccept={(invitation) => respondToInvitation(invitation, "accept")}
                  onDecline={(invitation) => respondToInvitation(invitation, "decline")}
                  busy={respondingId === request.invitation_id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No requests yet"
              message="When a hospital selects you for an eligible blood request, the invitation will appear here."
              icon="♡"
            />
          )}
        </section>

        {/* -------------------------------------------------
            QUICK ACTIONS
        -------------------------------------------------- */}
        <aside className="bb-card">
          <div className="bb-section-header">
            <div className="bb-section-heading">
              <span className="bb-card-eyebrow">
                Quick actions
              </span>

              <h2 className="bb-section-title">
                Stay ready
              </h2>
            </div>
          </div>

          <div className="bb-action-list">
            <Link
              to="/donor/requests"
              className="bb-action-item"
            >
              <span className="bb-action-icon">
                →
              </span>

              <span className="bb-action-content">
                <strong>Review invitations</strong>

                <small>
                  See requests selected for you
                </small>
              </span>
            </Link>

            <Link
              to="/donor/availability"
              className="bb-action-item"
            >
              <span className="bb-action-icon">
                ◷
              </span>

              <span className="bb-action-content">
                <strong>Update availability</strong>

                <small>
                  Manage when you can coordinate
                </small>
              </span>
            </Link>

            <Link
              to="/donor/history"
              className="bb-action-item"
            >
              <span className="bb-action-icon">
                +
              </span>

              <span className="bb-action-content">
                <strong>Donation history</strong>

                <small>
                  Review your previous donations
                </small>
              </span>
            </Link>
          </div>

          <div className="bb-info-box">
            <h3 className="bb-info-box-title">
              Private donor workspace
            </h3>

            <p>
              Your personal location and contact information
              remain protected until coordination rules allow
              sharing.
            </p>
          </div>
        </aside>
      </section>

      {/* =================================================
          PRIVACY
      ================================================== */}
      <PrivacyNoticeBox
        title="Your privacy stays protected"
        description="Your exact donor address is never visible to hospital teams. BloodBridge uses city-level and distance-based information only when it is required for eligible matching and coordination."
      />
    </div>
  );
}
