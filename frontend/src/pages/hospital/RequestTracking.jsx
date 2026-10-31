import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import "./Hospital.css";

const STAGES = [
  {
    key: "created",
    label: "Request Created",
    description: "The hospital created this blood request.",
  },
  {
    key: "matching",
    label: "Finding Donors",
    description: "Compatible donors are being identified.",
  },
  {
    key: "donors_invited",
    label: "Donors Invited",
    description: "Selected donors have been invited.",
  },
  {
    key: "responses",
    label: "Waiting for Responses",
    description: "Selected donors are responding to the invitation.",
  },
  {
    key: "coordination",
    label: "Coordination",
    description: "An accepted donor is available for coordination.",
  },
  {
    key: "fulfilled",
    label: "Request Fulfilled",
    description: "The required blood units have been fulfilled.",
  },
];

const STAGE_ORDER = STAGES.map((stage) => stage.key);

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatStatus(value) {
  if (!value) return "—";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getUrgencyClass(urgency) {
  switch (urgency) {
    case "critical":
      return "hospital-badge hospital-badge-danger";
    case "urgent":
      return "hospital-badge hospital-badge-warning";
    default:
      return "hospital-badge";
  }
}

function getStageState(stageKey, currentStage) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const stageIndex = STAGE_ORDER.indexOf(stageKey);

  if (currentIndex === -1 || stageIndex === -1) {
    return "pending";
  }

  if (stageIndex < currentIndex) {
    return "completed";
  }

  if (stageIndex === currentIndex) {
    return "current";
  }

  return "pending";
}

function getStageBadgeClass(state) {
  if (state === "completed") {
    return "hospital-badge hospital-badge-success";
  }

  if (state === "current") {
    return "hospital-badge hospital-badge-info";
  }

  return "hospital-badge hospital-badge-muted";
}

export default function RequestTracking() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTracking = useCallback(async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");

        const user = auth.currentUser;

        if (!user) {
          throw new Error("Your session has expired. Please log in again.");
        }

        const token = await user.getIdToken();

        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const [response, invitationsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/hospital/blood-requests/${requestId}/tracking/`, { method: "GET", headers }),
          fetch(`${API_BASE_URL}/hospital/blood-requests/${requestId}/matches/selected/`, { method: "GET", headers }),
        ]);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error("TRACKING API STATUS:", response.status);
          console.error("TRACKING API RESPONSE:", data);

          throw new Error(
            data?.detail || "Unable to load request tracking."
          );
        }

        const invitations = await invitationsResponse.json().catch(() => []);
        if (!invitationsResponse.ok) {
          throw new Error(invitations?.detail || "Unable to load donor invitation statuses.");
        }
        setTracking({ ...data, invitations: Array.isArray(invitations) ? invitations : invitations.results || [] });
      } catch (err) {
        setError(err.message || "Unable to load request tracking.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
  }, [requestId]);

  useEffect(() => { if (requestId) loadTracking(); }, [loadTracking, requestId]);

  if (loading) {
    return (
      <section className="hospital-page">
        <div className="hospital-page-header">
          <div>
            <p className="hospital-page-eyebrow">
              Blood Request
            </p>

            <h1 className="hospital-page-title">
              Request Tracking
            </h1>

            <p className="hospital-page-subtitle">
              Loading the current request lifecycle...
            </p>
          </div>
        </div>

        <div className="hospital-card">
          <div className="hospital-loading">
            <div className="hospital-loading-spinner" />

            <p>
              Loading request tracking...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="hospital-page">
        <div className="hospital-page-header">
          <div>
            <p className="hospital-page-eyebrow">
              Blood Request
            </p>

            <h1 className="hospital-page-title">
              Request Tracking
            </h1>
          </div>

          <div className="hospital-page-actions">
            <button
              type="button"
              className="hospital-secondary-button"
              onClick={() => navigate("/requests")}
            >
              Back to Requests
            </button>
          </div>
        </div>

        <div className="hospital-card">
          <div className="hospital-empty-state">
            <div className="hospital-empty-icon">
              !
            </div>

            <h3>
              Unable to load tracking
            </h3>

            <p>{error}</p>

            <button
              type="button"
              className="hospital-primary-button"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!tracking?.request) {
    return (
      <section className="hospital-page">
        <div className="hospital-card">
          <div className="hospital-empty-state">
            <div className="hospital-empty-icon">
              !
            </div>

            <h3>
              Request not found
            </h3>

            <p>
              We could not find the requested blood request.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const {
    request,
    summary,
    timeline = [],
  } = tracking;

  const currentStage =
    tracking.current_stage || "created";

  return (
    <section className="hospital-page">

      {/* HEADER */}
      <div className="hospital-page-header">
        <div>
          <p className="hospital-page-eyebrow">
            Blood Request Tracking
          </p>

          <h1 className="hospital-page-title">
            Request Tracking
          </h1>

          <p className="hospital-page-subtitle">
            Follow the progress of this blood request from
            creation through fulfillment.
          </p>
        </div>

        <div className="hospital-page-actions">
          <button
            type="button"
            className="hospital-secondary-button"
            onClick={() => loadTracking(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh status"}
          </button>

          <button
            type="button"
            className="hospital-secondary-button"
            onClick={() =>
              navigate(`/requests/${request.id}`)
            }
          >
            View Request
          </button>

          <button
            type="button"
            className="hospital-secondary-button"
            onClick={() => navigate("/requests")}
          >
            Back to Requests
          </button>
        </div>
      </div>

      {/* REQUEST SUMMARY */}
      <div className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              {request.blood_group} Blood Request
            </h2>

            <p className="hospital-card-subtitle">
              Request ID: {request.id}
            </p>
          </div>

          <div className="hospital-page-actions">
            <span className={getUrgencyClass(request.urgency)}>
              {formatStatus(request.urgency)}
            </span>

            <span className="hospital-badge">
              {formatStatus(request.status)}
            </span>
          </div>
        </div>

        <div className="hospital-detail-grid">
          <div className="hospital-detail-item">
            <span>Units Required</span>
            <strong>
              {request.units_required}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Units Fulfilled</span>
            <strong>
              {summary?.units_fulfilled ?? 0}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Units Remaining</span>
            <strong>
              {summary?.units_remaining ??
                request.units_required}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Required By</span>
            <strong>
              {formatDateTime(request.required_by)}
            </strong>
          </div>
        </div>
      </div>

      {/* INDIVIDUAL DONOR INVITATION STATUS */}
      <div className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">Selected Donors</h2>
            <p className="hospital-card-subtitle">Live status for invitations sent to eligible donors.</p>
          </div>
        </div>
        {tracking.invitations?.length ? (
          <div className="hospital-table-wrapper">
            <table className="hospital-table">
              <thead><tr><th>Donor</th><th>Blood Group</th><th>Distance</th><th>Invitation Status</th><th>Contact</th><th>Responded</th></tr></thead>
              <tbody>{tracking.invitations.map((invitation) => <tr key={invitation.id}>
                <td>{invitation.donor_name}</td>
                <td>{invitation.blood_group}</td>
                <td>{Number(invitation.distance_km).toFixed(2)} km</td>
                <td><span className={invitation.status === "accepted" ? "hospital-badge hospital-badge-success" : invitation.status === "declined" ? "hospital-badge hospital-badge-danger" : invitation.status === "pending" ? "hospital-badge hospital-badge-warning" : "hospital-badge hospital-badge-muted"}>{formatStatus(invitation.status)}</span></td>
                <td>{invitation.donor_phone || "Available after acceptance"}</td>
                <td>{formatDateTime(invitation.responded_at)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="hospital-empty-state"><strong>No donors invited yet</strong><span>Find eligible donors and send invitations to track their responses here.</span></div>
        )}
      </div>

      {/* CURRENT STATUS */}
      <div className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Current Status
            </h2>

            <p className="hospital-card-subtitle">
              {tracking.current_message}
            </p>
          </div>

          <span className="hospital-badge hospital-badge-info">
            {formatStatus(currentStage)}
          </span>
        </div>
      </div>

      {/* REQUEST PROGRESS */}
      <div className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Request Progress
            </h2>

            <p className="hospital-card-subtitle">
              Track each stage of the blood request lifecycle.
            </p>
          </div>
        </div>

        <div className="hospital-activity-list">
          {STAGES.map((stage) => {
            const state = getStageState(
              stage.key,
              currentStage
            );

            return (
              <div
                className="hospital-activity-item"
                key={stage.key}
              >
                <div className="hospital-activity-icon">
                  {state === "completed"
                    ? "✓"
                    : state === "current"
                    ? "•"
                    : "○"}
                </div>

                <div className="hospital-activity-content">
                  <strong>
                    {stage.label}
                  </strong>

                  <small>
                    {stage.description}
                  </small>
                </div>

                <span
                  className={getStageBadgeClass(state)}
                >
                  {formatStatus(state)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* DONOR RESPONSE SUMMARY */}
      <div className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Donor Responses
            </h2>

            <p className="hospital-card-subtitle">
              Current response status from selected donors.
            </p>
          </div>
        </div>

        <div className="hospital-detail-grid">
          <div className="hospital-detail-item">
            <span>Selected</span>
            <strong>
              {summary?.selected ?? 0}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Pending</span>
            <strong>
              {summary?.pending ?? 0}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Accepted</span>
            <strong>
              {summary?.accepted ?? 0}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Declined</span>
            <strong>
              {summary?.declined ?? 0}
            </strong>
          </div>
        </div>
      </div>

      {/* ACTIVITY TIMELINE */}
      <div className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Activity Timeline
            </h2>

            <p className="hospital-card-subtitle">
              Important events recorded for this request.
            </p>
          </div>
        </div>

        {timeline.length === 0 ? (
          <div className="hospital-empty-state">
            <div className="hospital-empty-icon">
              —
            </div>

            <h3>
              No activity yet
            </h3>

            <p>
              Request activity will appear here as the
              request progresses.
            </p>
          </div>
        ) : (
          <div className="hospital-activity-list">
            {timeline.map((item, index) => (
              <div
                className="hospital-activity-item"
                key={`${item.event}-${index}`}
              >
                <div
                  className={
                    item.status === "completed"
                      ? "hospital-activity-icon fulfilled"
                      : "hospital-activity-icon"
                  }
                >
                  {item.status === "completed"
                    ? "✓"
                    : "•"}
                </div>

                <div className="hospital-activity-content">
                  <strong>
                    {item.event}
                  </strong>

                  <small>
                    {formatDateTime(item.timestamp)}
                  </small>
                </div>

                <span
                  className={
                    item.status === "current"
                      ? "hospital-badge hospital-badge-info"
                      : "hospital-badge hospital-badge-muted"
                  }
                >
                  {formatStatus(item.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NOTES */}
      {request.hospital_notes && (
        <div className="hospital-card">
          <div className="hospital-card-header">
            <div>
              <h2 className="hospital-card-title">
                Hospital Notes
              </h2>

              <p className="hospital-card-subtitle">
                Additional information attached to this request.
              </p>
            </div>
          </div>

          <div className="hospital-request-notes">
            <div className="hospital-request-notes-icon">
              i
            </div>

            <p>
              {request.hospital_notes}
            </p>
          </div>
        </div>
      )}

      {/* ACTIONS */}
      <div className="hospital-page-actions">
        <button
          type="button"
          className="hospital-secondary-button"
          onClick={() =>
            navigate(
              `/requests/${request.id}/matches`
            )
          }
        >
          View Donor Matches
        </button>

        <button
          type="button"
          className="hospital-primary-button"
          onClick={() =>
            navigate(`/requests/${request.id}`)
          }
        >
          View Request Details
        </button>
      </div>
    </section>
  );
}
