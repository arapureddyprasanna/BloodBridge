import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import {
  EmptyState,
  LoadingState,
  PageHeader,
  PrivacyNoticeBox,
  StatusBadge,
  formatDate,
  formatDateTime,
} from "./DonorComponents";
import "./DonorWorkspace.css";

export default function DonorRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] =
    useState(false);

  const loadRequest = useCallback(async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;

      if (!user) {
        setRequest(null);
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/donor/requests/${requestId}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to load invitation details."
        );
      }

      setRequest(data);
    } catch (error) {
      console.error(
        "Request details load failed:",
        error
      );

      showToast(
        error.message ||
          "Unable to load request details.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const respond = async (decision) => {
    const user = auth.currentUser;

    if (!user) {
      showToast(
        "Please sign in again to continue.",
        "error"
      );
      return;
    }

    try {
      setResponding(true);

      const token = await user.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/donor/requests/${requestId}/${decision}/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Unable to ${decision} this invitation.`
        );
      }

      showToast(
        data.detail ||
          "Invitation response saved.",
        "success"
      );

      await loadRequest();
    } catch (error) {
      showToast(
        error.message ||
          "Unable to save your response.",
        "error"
      );
    } finally {
      setResponding(false);
    }
  };

  if (loading) {
    return (
      <div className="bb-page-shell">
        <PageHeader
          eyebrow="DONATION WORKSPACE"
          title="Request details"
          subtitle="Loading the selected hospital invitation."
        />

        <LoadingState message="Loading request details..." />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="bb-page-shell">
        <PageHeader
          eyebrow="DONATION WORKSPACE"
          title="Request details"
          subtitle="The selected invitation could not be found in your donor inbox."
          action={() => navigate("/donor/requests")}
          actionLabel="Back to requests"
        />

        <EmptyState
          title="Request unavailable"
          message="This invitation is not available to your account."
          icon="◌"
        />
      </div>
    );
  }

  const status = String(
    request.status || "pending"
  ).toLowerCase();

  const isPending = status === "pending";

  const requestCode = String(
    request.blood_request_id || requestId
  )
    .slice(0, 8)
    .toUpperCase();

  return (
    <div className="bb-page-shell">
      <PageHeader
        eyebrow="DONATION WORKSPACE"
        title="Request details"
        subtitle="Review the hospital request carefully before deciding whether you can help."
        action={() => navigate("/donor/requests")}
        actionLabel="Back to requests"
      />

      <section className="bb-donor-detail-hero">
        <div className="bb-donor-detail-hero-blood">
          <span>Blood group</span>
          <strong>
            {request.blood_group || "—"}
          </strong>
        </div>

        <div className="bb-donor-detail-hero-copy">
          <span className="bb-hero-eyebrow">
            HOSPITAL INVITATION
          </span>

          <h2>
            {request.hospital_name ||
              request.hospital ||
              "Hospital"}
          </h2>

          <p>
            {[
              request.hospital_city,
              request.hospital_state,
            ]
              .filter(Boolean)
              .join(", ") ||
              "Hospital location not provided"}
          </p>
        </div>

        <div className="bb-donor-detail-hero-status">
          <StatusBadge status={status} />
          <span>Request #{requestCode}</span>
        </div>
      </section>

      <section className="bb-donor-detail-grid">
        <div className="bb-card">
          <div className="bb-card-header">
            <div className="bb-card-heading">
              <span className="bb-card-eyebrow">
                REQUEST
              </span>

              <h2 className="bb-card-title">
                Donation requirements
              </h2>

              <p className="bb-card-description">
                The information the hospital provided
                for this blood request.
              </p>
            </div>
          </div>

          <div className="bb-donor-detail-info-grid">
            <div className="bb-donor-detail-info-item bb-donor-detail-info-item--blood">
              <span>Blood group</span>
              <strong>
                {request.blood_group || "—"}
              </strong>
            </div>

            <div className="bb-donor-detail-info-item">
              <span>Units required</span>
              <strong>
                {request.units_required || "—"}
              </strong>
            </div>

            <div className="bb-donor-detail-info-item">
              <span>Urgency</span>
              <strong>
                {request.urgency || "Standard"}
              </strong>
            </div>

            <div className="bb-donor-detail-info-item">
              <span>Required by</span>
              <strong>
                {formatDateTime(
                  request.required_by
                )}
              </strong>
            </div>

            <div className="bb-donor-detail-info-item">
              <span>Distance</span>
              <strong>
                {request.distance_km != null
                  ? `${request.distance_km} km`
                  : "Not available"}
              </strong>
            </div>

            <div className="bb-donor-detail-info-item">
              <span>Invitation sent</span>
              <strong>
                {formatDateTime(
                  request.selected_at
                )}
              </strong>
            </div>
          </div>
        </div>

        <div className="bb-card bb-donor-hospital-card">
          <div className="bb-card-header">
            <div className="bb-card-heading">
              <span className="bb-card-eyebrow">
                HOSPITAL
              </span>

              <h2 className="bb-card-title">
                {request.hospital_name ||
                  request.hospital ||
                  "Hospital"}
              </h2>
            </div>
          </div>

          <div className="bb-donor-hospital-location">
            <span className="bb-donor-hospital-location-icon">
              ⌖
            </span>

            <div>
              <strong>
                {[
                  request.hospital_city,
                  request.hospital_state,
                ]
                  .filter(Boolean)
                  .join(", ") ||
                  "Location unavailable"}
              </strong>

              <span>
                {request.distance_km != null
                  ? `${request.distance_km} km from your registered location`
                  : "Distance information unavailable"}
              </span>
            </div>
          </div>

          {request.hospital_notes && (
            <div className="bb-donor-notes">
              <span>Hospital notes</span>
              <p>{request.hospital_notes}</p>
            </div>
          )}
        </div>
      </section>

      <PrivacyNoticeBox
        title="Your privacy stays protected"
        description="Your address and personal contact details are not shared with the hospital before you accept. Information is disclosed only according to BloodBridge's donor privacy rules after confirmation."
      />

      <section className="bb-donor-response-card">
        <div>
          <span className="bb-card-eyebrow">
            YOUR RESPONSE
          </span>

          <h2>
            {isPending
              ? "Can you help with this request?"
              : "Invitation response"}
          </h2>

          <p>
            {isPending
              ? "Please review the request details before accepting or declining the invitation."
              : request.responded_at
                ? `You responded on ${formatDate(
                    request.responded_at
                  )}.`
                : "This invitation is no longer awaiting your response."}
          </p>
        </div>

        {isPending && (
          <div className="bb-donor-response-actions">
            <button
              type="button"
              className="bb-secondary-button bb-donor-decline-button"
              disabled={responding}
              onClick={() =>
                respond("decline")
              }
            >
              {responding
                ? "Updating..."
                : "Decline invitation"}
            </button>

            <button
              type="button"
              className="bb-primary-button"
              disabled={responding}
              onClick={() =>
                respond("accept")
              }
            >
              {responding
                ? "Updating..."
                : "Accept invitation"}
            </button>
          </div>
        )}

        {!isPending &&
          request.responded_at && (
            <span className="bb-donor-response-date">
              Responded{" "}
              {formatDate(
                request.responded_at
              )}
            </span>
          )}
      </section>

      <div className="bb-page-actions">
        <Link
          className="bb-secondary-button"
          to="/donor/requests"
        >
          Return to requests
        </Link>
      </div>
    </div>
  );
}