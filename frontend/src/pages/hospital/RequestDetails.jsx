import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "../../firebase";
import { showToast } from "../../App";

function formatRequestId(id) {
  if (!id) return "—";

  const value = String(id).replace(/-/g, "").toUpperCase();

  return `BB-${value.slice(0, 6)}`;
}

function formatDateTime(value) {
  if (!value) return "Not specified";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getUrgencyLabel(value) {
  if (value === "critical") return "Critical";
  if (value === "urgent") return "High";
  return "Routine";
}

function getStatusLabel(value) {
  const labels = {
    open: "Open",
    matching: "Matching",
    partially_fulfilled: "Partially fulfilled",
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
    expired: "Expired",
  };

  return labels[value] || value || "Unknown";
}

function getStatusClass(status) {
  switch (status) {
    case "open":
      return "hospital-badge hospital-badge-warning";

    case "matching":
      return "hospital-badge hospital-badge-info";

    case "partially_fulfilled":
      return "hospital-badge hospital-badge-warning";

    case "fulfilled":
      return "hospital-badge hospital-badge-success";

    case "cancelled":
    case "expired":
      return "hospital-badge hospital-badge-muted";

    default:
      return "hospital-badge";
  }
}

function getUrgencyClass(urgency) {
  if (urgency === "critical") {
    return "hospital-badge hospital-badge-danger";
  }

  if (urgency === "urgent") {
    return "hospital-badge hospital-badge-warning";
  }

  return "hospital-badge hospital-badge-muted";
}

export default function RequestDetails() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [availableCommunities, setAvailableCommunities] = useState([]);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState([]);
  const [savingShares, setSavingShares] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigate("/login", { replace: true });
        return;
      }

      const token = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/hospital/blood-requests/${requestId}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        await auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail || "Unable to load this blood request."
        );
      }

      setRequest(data);
      const sharingResponse = await fetch(`${API_BASE_URL}/communities/hospital/requests/${requestId}/share/`, { headers: { Authorization: `Bearer ${token}` } });
      const sharingData = await sharingResponse.json().catch(() => ({}));
      if (sharingResponse.ok) {
        setAvailableCommunities(sharingData.available_communities || []);
        setSelectedCommunityIds(sharingData.shared_community_ids || []);
      } else {
        throw new Error(sharingData.detail || "Unable to load community sharing options.");
      }
    } catch (error) {
      console.error("Failed to load blood request:", error);

      showToast(
        error.message || "Unable to load this blood request.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [requestId, navigate]);

  const saveCommunitySharing = async () => {
    if (!request) return;
    setSavingShares(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch(`${API_BASE_URL}/communities/hospital/requests/${request.id}/share/`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${await currentUser.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ community_ids: selectedCommunityIds }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to update community sharing.");
      showToast("Community sharing updated.");
      await loadRequest();
    } catch (error) {
      showToast(error.message || "Unable to update community sharing.", "error");
    } finally { setSavingShares(false); }
  };
  const fulfillRequest = async () => {
  const confirmed = window.confirm(
    "Confirm that this blood request has been fulfilled at the hospital?"
  );

  if (!confirmed) return;

  try {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      navigate("/login", { replace: true });
      return;
    }

    const token = await currentUser.getIdToken();

    const response = await fetch(
      `${API_BASE_URL}/hospital/blood-requests/${requestId}/fulfill/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 401) {
      await auth.signOut();
      navigate("/login", { replace: true });
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || "Unable to fulfill the blood request."
      );
    }

    showToast("Blood request marked as fulfilled.", "success");

    await loadRequest();
  } catch (error) {
    showToast(
      error.message || "Unable to fulfill the blood request.",
      "error"
    );
  }
};

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  if (loading) {
    return (
      <div className="hospital-page">
        <div className="hospital-loading">
          <div className="hospital-loading-spinner" />
          <p>Loading blood request...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="hospital-page">
        <div className="hospital-empty-state">
          <div className="hospital-empty-icon">🩸</div>

          <h3>Blood request not found</h3>

          <p>
            The requested blood request could not be loaded.
          </p>

          <button
            type="button"
            className="hospital-primary-button"
            onClick={() => navigate("/requests")}
          >
            Back to Blood Requests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hospital-page">
      <div className="hospital-page-header">
        <div>
          <button
            type="button"
            className="hospital-text-button"
            onClick={() => navigate("/requests")}
          >
            ← Back to Blood Requests
          </button>

          <p className="hospital-page-eyebrow">
            Blood request
          </p>

          <h1 className="hospital-page-title">
            {formatRequestId(request.id)}
          </h1>

          <p className="hospital-page-subtitle">
            Review request information, urgency, timeline,
            and fulfilment status.
          </p>
        </div>

        <div className="hospital-page-actions">
          <button
            type="button"
            className="hospital-secondary-button"
            onClick={loadRequest}
            disabled={loading}
          >
            ↻ Refresh
          </button>

          {["open", "matching", "partially_fulfilled"].includes(
            request.status
          ) && (
              <button
                type="button"
                className="hospital-primary-button"
                onClick={() =>
                  navigate(`/requests/${request.id}/matches`)
                }
              >
                Find Matching Donors
              </button>
            )}
          {request &&
            ["open", "matching", "partially_fulfilled"].includes(
              request.status
            ) && (
              <button
                type="button"
                className="bb-primary-button"
                onClick={fulfillRequest}
              >
                Mark as Fulfilled
              </button>
            )}
        </div>
      </div>

      <div className="hospital-kpi-grid">
        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">🩸</div>

          <div>
            <p className="hospital-kpi-label">
              Blood Group
            </p>

            <p className="hospital-kpi-value">
              {request.blood_group || "—"}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">◷</div>

          <div>
            <p className="hospital-kpi-label">
              Units Required
            </p>

            <p className="hospital-kpi-value">
              {request.units_required ?? "—"}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">!</div>

          <div>
            <p className="hospital-kpi-label">
              Urgency
            </p>

            <p className="hospital-kpi-value">
              {getUrgencyLabel(request.urgency)}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">✓</div>

          <div>
            <p className="hospital-kpi-label">
              Status
            </p>

            <p className="hospital-kpi-value">
              {getStatusLabel(request.status)}
            </p>
          </div>
        </div>
      </div>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Request Information
            </h2>

            <p className="hospital-card-subtitle">
              Details submitted for this blood request.
            </p>
          </div>

          <span
            className={getStatusClass(request.status)}
          >
            {getStatusLabel(request.status)}
          </span>
        </div>

        <div className="hospital-detail-grid">
          <div className="hospital-detail-item">
            <span>Request ID</span>
            <strong>{formatRequestId(request.id)}</strong>
          </div>

          <div className="hospital-detail-item">
            <span>Blood Group</span>
            <strong>{request.blood_group || "—"}</strong>
          </div>

          <div className="hospital-detail-item">
            <span>Units Required</span>
            <strong>{request.units_required ?? "—"}</strong>
          </div>

          <div className="hospital-detail-item">
            <span>Urgency</span>
            <strong>
              <span
                className={getUrgencyClass(request.urgency)}
              >
                {getUrgencyLabel(request.urgency)}
              </span>
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Created</span>
            <strong>
              {formatDateTime(request.created_at)}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Required By</span>
            <strong>
              {formatDateTime(request.required_by)}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Last Updated</span>
            <strong>
              {formatDateTime(request.updated_at)}
            </strong>
          </div>
        </div>
      </section>

      {request.hospital_notes && (
        <section className="hospital-card">
          <div className="hospital-card-header">
            <div>
              <h2 className="hospital-card-title">
                Additional Notes
              </h2>

              <p className="hospital-card-subtitle">
                Information provided with the request.
              </p>
            </div>
          </div>

          <p className="hospital-card-subtitle">
            {request.hospital_notes}
          </p>
        </section>
      )}

      <section className="hospital-card">
        <div className="hospital-card-header"><div><h2 className="hospital-card-title">Share with verified communities</h2><p className="hospital-card-subtitle">Only the communities you select can see limited request details and aggregate coordination status. Donor selection stays in your hospital workflow.</p></div></div>
        {availableCommunities.length ? <><div className="hospital-community-share-list">{availableCommunities.map((community) => <label key={community.id} className="hospital-community-share-option"><input type="checkbox" checked={selectedCommunityIds.includes(community.id)} onChange={(event) => setSelectedCommunityIds((current) => event.target.checked ? [...current, community.id] : current.filter((id) => id !== community.id))} /><span><strong>{community.name}</strong><small>{[community.city, community.state].filter(Boolean).join(", ") || "Location not provided"}</small></span></label>)}</div><button type="button" className="hospital-primary-button" onClick={saveCommunitySharing} disabled={savingShares || !["open", "matching", "partially_fulfilled"].includes(request.status)}>{savingShares ? "Saving…" : "Save community sharing"}</button></> : <p className="hospital-card-subtitle">No active, verified communities are currently eligible for request sharing.</p>}
      </section>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              What happens next?
            </h2>

            <p className="hospital-card-subtitle">
              Continue managing this request from here.
            </p>
          </div>
        </div>

        <div className="hospital-detail-grid">
          <div className="hospital-detail-item">
            <span>Current Status</span>

            <strong>
              {getStatusLabel(request.status)}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Donor Coordination</span>

            <strong>
              {["open", "matching", "partially_fulfilled"].includes(
                request.status
              )
                ? "Available"
                : request.status === "fulfilled"
                  ? "Completed"
                  : "Unavailable"}
            </strong>
          </div>
        </div>

        {["open", "matching", "partially_fulfilled"].includes(
          request.status
        ) && (
            <div className="hospital-page-actions">
              <button
                type="button"
                className="hospital-primary-button"
                onClick={() =>
                  navigate(`/requests/${request.id}/matches`)
                }
              >
                View Matching Donors
              </button>

              <button
                type="button"
                className="hospital-secondary-button"
                onClick={() =>
                  navigate(`/requests/${request.id}/tracking`)
                }
              >
                Track Request
              </button>
            </div>
          )}

        {request.status === "fulfilled" && (
          <div className="hospital-page-actions">
            <button
              type="button"
              className="hospital-secondary-button"
              onClick={() =>
                navigate(`/requests/${request.id}/tracking`)
              }
            >
              View Request Tracking
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
