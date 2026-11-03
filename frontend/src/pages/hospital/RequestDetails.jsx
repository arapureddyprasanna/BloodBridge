import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function getDonationStatusClass(status) {
  switch (status) {
    case "completed":
      return "hospital-badge hospital-badge-success";

    case "scheduled":
      return "hospital-badge hospital-badge-info";

    case "cancelled":
      return "hospital-badge hospital-badge-muted";

    default:
      return "hospital-badge";
  }
}

export default function RequestDetails() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [donations, setDonations] = useState([]);

  const [availableCommunities, setAvailableCommunities] = useState([]);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState([]);

  const [savingShares, setSavingShares] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showDonationModal, setShowDonationModal] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [savingDonation, setSavingDonation] = useState(false);
  const [completingDonationId, setCompletingDonationId] = useState(null);

  const [donationForm, setDonationForm] = useState({
    units_donated: "1",
    donation_date: "",
    notes: "",
  });

  const getToken = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      navigate("/login", { replace: true });
      return null;
    }

    return currentUser.getIdToken();
  }, [navigate]);

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const token = await getToken();

      if (!token) return;

      const requestResponse = await fetch(
        `${API_BASE_URL}/hospital/blood-requests/${requestId}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (requestResponse.status === 401) {
        await auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      const requestData = await requestResponse
        .json()
        .catch(() => null);

      if (!requestResponse.ok) {
        throw new Error(
          requestData?.detail ||
          "Unable to load this blood request."
        );
      }

      setRequest(requestData);

      const [
        sharingResponse,
        trackingResponse,
        donationsResponse,
      ] = await Promise.all([
        fetch(
          `${API_BASE_URL}/communities/hospital/requests/${requestId}/share/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        ),

        fetch(
          `${API_BASE_URL}/hospital/blood-requests/${requestId}/tracking/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        ),

        fetch(`${API_BASE_URL}/donations/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      const sharingData = await sharingResponse
        .json()
        .catch(() => ({}));

      const trackingData = await trackingResponse
        .json()
        .catch(() => ({}));

      const donationsData = await donationsResponse
        .json()
        .catch(() => []);

      if (!sharingResponse.ok) {
        throw new Error(
          sharingData.detail ||
          "Unable to load community sharing options."
        );
      }

      if (!trackingResponse.ok) {
        throw new Error(
          trackingData.detail ||
          "Unable to load request tracking."
        );
      }

      if (!donationsResponse.ok) {
        throw new Error(
          donationsData.detail ||
          "Unable to load donation information."
        );
      }

      setAvailableCommunities(
        sharingData.available_communities || []
      );

      setSelectedCommunityIds(
        sharingData.shared_community_ids || []
      );

      setTracking(trackingData);

      const donationList = Array.isArray(donationsData)
        ? donationsData
        : donationsData.results || [];

      setDonations(
        donationList.filter(
          (donation) =>
            String(donation.blood_request_id) ===
            String(requestId)
        )
      );
    } catch (error) {
      console.error(
        "Failed to load blood request:",
        error
      );

      showToast(
        error.message ||
        "Unable to load this blood request.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [requestId, navigate, getToken]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const acceptedDonors = useMemo(() => {
    const invitations = tracking?.invitations || [];

    return invitations.filter(
      (invitation) => invitation.status === "accepted"
    );
  }, [tracking]);

  const completedUnits = useMemo(() => {
    return donations
      .filter(
        (donation) => donation.status === "completed"
      )
      .reduce(
        (total, donation) =>
          total + Number(donation.units_donated || 0),
        0
      );
  }, [donations]);

  const scheduledUnits = useMemo(() => {
    return donations
      .filter(
        (donation) => donation.status === "scheduled"
      )
      .reduce(
        (total, donation) =>
          total + Number(donation.units_donated || 0),
        0
      );
  }, [donations]);



  const completedRemainingUnits = Math.max(
    Number(request?.units_required || 0) -
    completedUnits,
    0
  );

  const getDonationForDonor = (donorId) => {
    return donations.find(
      (donation) =>
        String(donation.donor_id) ===
        String(donorId)
    );
  };

  const openDonationModal = (donor) => {
    const existingDonation = getDonationForDonor(
      donor.donor_id
    );

    if (existingDonation) {
      return;
    }

    const now = new Date();

    const localDateTime = new Date(
      now.getTime() -
      now.getTimezoneOffset() * 60000
    )
      .toISOString()
      .slice(0, 16);

    setSelectedDonor(donor);

    setDonationForm({
      units_donated: "1",
      donation_date: localDateTime,
      notes: "",
    });

    setShowDonationModal(true);
  };

  const closeDonationModal = () => {
    if (savingDonation) return;

    setShowDonationModal(false);
    setSelectedDonor(null);
  };

  const handleDonationFormChange = (event) => {
    const { name, value } = event.target;

    setDonationForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const recordDonation = async (event) => {
    event.preventDefault();

    if (!selectedDonor || !request) return;

    const units = Number(
      donationForm.units_donated
    );

    if (!Number.isInteger(units) || units < 1) {
      showToast(
        "Units donated must be at least 1.",
        "error"
      );
      return;
    }

    if (units > completedRemainingUnits) {
      showToast(
        `Only ${completedRemainingUnits} unit(s) remain for this request.`,
        "error"
      );
      return;
    }

    try {
      setSavingDonation(true);

      const token = await getToken();

      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/donations/create/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            blood_request_id: request.id,
            donor_id: selectedDonor.donor_id,
            units_donated: units,
            donation_date: donationForm.donation_date,
            notes: donationForm.notes,
          }),
        }
      );

      if (response.status === 401) {
        await auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        const validationMessage =
          data?.units_donated?.[0] ||
          data?.detail ||
          "Unable to record the donation.";

        throw new Error(validationMessage);
      }

      showToast(
        "Donation recorded as scheduled.",
        "success"
      );

      closeDonationModal();

      await loadRequest();
    } catch (error) {
      showToast(
        error.message ||
        "Unable to record the donation.",
        "error"
      );
    } finally {
      setSavingDonation(false);
    }
  };

  const completeDonation = async (donation) => {
    const confirmed = window.confirm(
      `Confirm that ${donation.donor_name || "this donor"} completed the donation of ${donation.units_donated} unit(s)?`
    );

    if (!confirmed) return;

    try {
      setCompletingDonationId(donation.id);

      const token = await getToken();

      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/donations/${donation.id}/complete/`,
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

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail ||
          "Unable to confirm the donation."
        );
      }

      showToast(
        "Donation confirmed successfully.",
        "success"
      );

      await loadRequest();
    } catch (error) {
      showToast(
        error.message ||
        "Unable to confirm the donation.",
        "error"
      );
    } finally {
      setCompletingDonationId(null);
    }
  };

  const saveCommunitySharing = async () => {
    if (!request) return;

    setSavingShares(true);

    try {
      const token = await getToken();

      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/communities/hospital/requests/${request.id}/share/`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            community_ids: selectedCommunityIds,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
          "Unable to update community sharing."
        );
      }

      showToast("Community sharing updated.");

      await loadRequest();
    } catch (error) {
      showToast(
        error.message ||
        "Unable to update community sharing.",
        "error"
      );
    } finally {
      setSavingShares(false);
    }
  };

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
          <div className="hospital-empty-icon">
            🩸
          </div>

          <h3>Blood request not found</h3>

          <p>
            The requested blood request could not be
            loaded.
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

  const activeRequestStatuses = [
    "open",
    "matching",
    "partially_fulfilled",
  ];

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
            Review request information, donor
            coordination, donations, and fulfilment
            status.
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

          {activeRequestStatuses.includes(
            request.status
          ) && (
              <button
                type="button"
                className="hospital-primary-button"
                onClick={() =>
                  navigate(
                    `/requests/${request.id}/matches`
                  )
                }
              >
                Find Matching Donors
              </button>
            )}
        </div>
      </div>

      <div className="hospital-kpi-grid">
        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">
            🩸
          </div>

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
          <div className="hospital-kpi-icon">
            ◷
          </div>

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
          <div className="hospital-kpi-icon">
            ✓
          </div>

          <div>
            <p className="hospital-kpi-label">
              Units Completed
            </p>

            <p className="hospital-kpi-value">
              {completedUnits} /{" "}
              {request.units_required}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">
            !
          </div>

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
              Donation Progress
            </h2>

            <p className="hospital-card-subtitle">
              Only completed donations count toward
              fulfilling this blood request.
            </p>
          </div>

          <span
            className={getStatusClass(
              request.status
            )}
          >
            {getStatusLabel(request.status)}
          </span>
        </div>

        <div className="hospital-detail-grid">
          <div className="hospital-detail-item">
            <span>Required</span>
            <strong>
              {request.units_required} unit(s)
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Completed</span>
            <strong>
              {completedUnits} unit(s)
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Scheduled</span>
            <strong>
              {scheduledUnits} unit(s)
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Remaining to fulfil</span>
            <strong>
              {completedRemainingUnits} unit(s)
            </strong>
          </div>
        </div>
      </section>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Accepted Donors
            </h2>

            <p className="hospital-card-subtitle">
              Donors who accepted an invitation for
              this request can have their donation
              recorded here.
            </p>
          </div>

          <span className="hospital-badge hospital-badge-info">
            {acceptedDonors.length} accepted
          </span>
        </div>

        {acceptedDonors.length === 0 ? (
          <div className="hospital-empty-state">
            <div className="hospital-empty-icon">
              👤
            </div>

            <h3>No accepted donors yet</h3>

            <p>
              Donors who accept invitations will appear
              here for donation coordination.
            </p>
          </div>
        ) : (
          <div className="hospital-table-wrapper">
            <table className="hospital-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Blood Group</th>
                  <th>Distance</th>
                  <th>Donation</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {acceptedDonors.map((donor) => {
                  const donation =
                    getDonationForDonor(
                      donor.donor_id
                    );

                  return (
                    <tr key={donor.id}>
                      <td>
                        <strong>
                          {donor.donor_name ||
                            donor.name ||
                            "Donor"}
                        </strong>

                        {donor.donor_phone && (
                          <small>
                            {donor.donor_phone}
                          </small>
                        )}
                      </td>

                      <td>
                        {donor.blood_group || "—"}
                      </td>

                      <td>
                        {donor.distance_km != null
                          ? `${donor.distance_km} km`
                          : "—"}
                      </td>

                      <td>
                        {donation ? (
                          <span
                            className={getDonationStatusClass(
                              donation.status
                            )}
                          >
                            {donation.status ===
                              "completed"
                              ? "Completed"
                              : donation.status ===
                                "scheduled"
                                ? "Scheduled"
                                : "Cancelled"}
                          </span>
                        ) : (
                          <span className="hospital-badge hospital-badge-warning">
                            Not recorded
                          </span>
                        )}
                      </td>

                      <td>
                        {!donation &&
                          activeRequestStatuses.includes(
                            request.status
                          ) &&
                          completedRemainingUnits >
                          0 && (
                            <button
                              type="button"
                              className="hospital-primary-button"
                              onClick={() =>
                                openDonationModal(
                                  donor
                                )
                              }
                            >
                              Record Donation
                            </button>
                          )}

                        {donation?.status ===
                          "scheduled" && (
                            <button
                              type="button"
                              className="hospital-primary-button"
                              onClick={() =>
                                completeDonation(
                                  donation
                                )
                              }
                              disabled={
                                completingDonationId ===
                                donation.id
                              }
                            >
                              {completingDonationId ===
                                donation.id
                                ? "Confirming…"
                                : "Confirm Donation"}
                            </button>
                          )}

                        {donation?.status ===
                          "completed" && (
                            <span className="hospital-badge hospital-badge-success">
                              Completed
                            </span>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Donation Records
            </h2>

            <p className="hospital-card-subtitle">
              Scheduled and completed donations
              associated with this request.
            </p>
          </div>
        </div>

        {donations.length === 0 ? (
          <p className="hospital-card-subtitle">
            No donations have been recorded for this
            request yet.
          </p>
        ) : (
          <div className="hospital-table-wrapper">
            <table className="hospital-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Units</th>
                  <th>Donation Date</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>

              <tbody>
                {donations.map((donation) => (
                  <tr key={donation.id}>
                    <td>
                      {donation.donor_name ||
                        "Donor"}
                    </td>

                    <td>
                      {donation.units_donated}
                    </td>

                    <td>
                      {formatDateTime(
                        donation.donation_date
                      )}
                    </td>

                    <td>
                      <span
                        className={getDonationStatusClass(
                          donation.status
                        )}
                      >
                        {donation.status}
                      </span>
                    </td>

                    <td>
                      {donation.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Request Information
            </h2>

            <p className="hospital-card-subtitle">
              Details submitted for this blood
              request.
            </p>
          </div>

          <span
            className={getStatusClass(
              request.status
            )}
          >
            {getStatusLabel(request.status)}
          </span>
        </div>

        <div className="hospital-detail-grid">
          <div className="hospital-detail-item">
            <span>Request ID</span>
            <strong>
              {formatRequestId(request.id)}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Blood Group</span>
            <strong>
              {request.blood_group || "—"}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Units Required</span>
            <strong>
              {request.units_required ?? "—"}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Urgency</span>

            <strong>
              <span
                className={getUrgencyClass(
                  request.urgency
                )}
              >
                {getUrgencyLabel(request.urgency)}
              </span>
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Created</span>

            <strong>
              {formatDateTime(
                request.created_at
              )}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Required By</span>

            <strong>
              {formatDateTime(
                request.required_by
              )}
            </strong>
          </div>

          <div className="hospital-detail-item">
            <span>Last Updated</span>

            <strong>
              {formatDateTime(
                request.updated_at
              )}
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
                Information provided with the
                request.
              </p>
            </div>
          </div>

          <p className="hospital-card-subtitle">
            {request.hospital_notes}
          </p>
        </section>
      )}

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Share with verified communities
            </h2>

            <p className="hospital-card-subtitle">
              Only the communities you select can see
              limited request details and aggregate
              coordination status. Donor selection
              stays in your hospital workflow.
            </p>
          </div>
        </div>

        {availableCommunities.length ? (
          <>
            <div className="hospital-community-share-list">
              {availableCommunities.map(
                (community) => (
                  <label
                    key={community.id}
                    className="hospital-community-share-option"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCommunityIds.includes(
                        community.id
                      )}
                      onChange={(event) =>
                        setSelectedCommunityIds(
                          (current) =>
                            event.target.checked
                              ? [
                                ...current,
                                community.id,
                              ]
                              : current.filter(
                                (id) =>
                                  id !==
                                  community.id
                              )
                        )
                      }
                    />

                    <span>
                      <strong>
                        {community.name}
                      </strong>

                      <small>
                        {[
                          community.city,
                          community.state,
                        ]
                          .filter(Boolean)
                          .join(", ") ||
                          "Location not provided"}
                      </small>
                    </span>
                  </label>
                )
              )}
            </div>

            <button
              type="button"
              className="hospital-primary-button"
              onClick={saveCommunitySharing}
              disabled={
                savingShares ||
                !activeRequestStatuses.includes(
                  request.status
                )
              }
            >
              {savingShares
                ? "Saving…"
                : "Save community sharing"}
            </button>
          </>
        ) : (
          <p className="hospital-card-subtitle">
            No active, verified communities are
            currently eligible for request sharing.
          </p>
        )}
      </section>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              What happens next?
            </h2>

            <p className="hospital-card-subtitle">
              Continue managing this request from
              here.
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
              {activeRequestStatuses.includes(
                request.status
              )
                ? "Available"
                : request.status === "fulfilled"
                  ? "Completed"
                  : "Unavailable"}
            </strong>
          </div>
        </div>

        {activeRequestStatuses.includes(
          request.status
        ) && (
            <div className="hospital-page-actions">
              <button
                type="button"
                className="hospital-primary-button"
                onClick={() =>
                  navigate(
                    `/requests/${request.id}/matches`
                  )
                }
              >
                View Matching Donors
              </button>

              <button
                type="button"
                className="hospital-secondary-button"
                onClick={() =>
                  navigate(
                    `/requests/${request.id}/tracking`
                  )
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
                navigate(
                  `/requests/${request.id}/tracking`
                )
              }
            >
              View Request Tracking
            </button>
          </div>
        )}
      </section>

      {showDonationModal && selectedDonor && (
        <div
          className="hospital-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDonationModal();
            }
          }}
        >
          <div
            className="hospital-donation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-donation-title"
          >
            {/* Header */}
            <div className="hospital-donation-modal-header">
              <div>
                <p className="hospital-donation-modal-eyebrow">
                  Donation coordination
                </p>

                <h2
                  id="record-donation-title"
                  className="hospital-donation-modal-title"
                >
                  Record Donation
                </h2>

                <p className="hospital-donation-modal-description">
                  Record this donation as scheduled. It will only
                  count toward fulfilment after the hospital confirms
                  that the donation was completed.
                </p>
              </div>

              <button
                type="button"
                className="hospital-donation-modal-close"
                onClick={closeDonationModal}
                disabled={savingDonation}
                aria-label="Close donation modal"
              >
                ×
              </button>
            </div>

            {/* Donor summary */}
            <div className="hospital-donation-summary">
              <div className="hospital-donation-summary-item hospital-donation-summary-primary">
                <span>Donor</span>

                <strong>
                  {selectedDonor.donor_name ||
                    selectedDonor.name ||
                    "Donor"}
                </strong>
              </div>

              <div className="hospital-donation-summary-item">
                <span>Blood Group</span>

                <strong>
                  {selectedDonor.blood_group || "—"}
                </strong>
              </div>

              <div className="hospital-donation-summary-item">
                <span>Distance</span>

                <strong>
                  {selectedDonor.distance_km != null
                    ? `${selectedDonor.distance_km} km`
                    : "—"}
                </strong>
              </div>

              <div className="hospital-donation-summary-item">
                <span>Remaining</span>

                <strong>
                  {completedRemainingUnits} unit
                  {completedRemainingUnits === 1 ? "" : "s"}
                </strong>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={recordDonation}
              className="hospital-donation-form"
            >
              <div className="hospital-donation-section-heading">
                <h3>Donation details</h3>

                <p>
                  Enter the scheduled donation information below.
                </p>
              </div>

              <div className="hospital-donation-form-grid">
                <div className="hospital-donation-field">
                  <label htmlFor="units_donated">
                    Units donated
                  </label>

                  <input
                    id="units_donated"
                    name="units_donated"
                    type="number"
                    min="1"
                    max={completedRemainingUnits}
                    value={donationForm.units_donated}
                    onChange={handleDonationFormChange}
                    required
                  />

                  <span className="hospital-donation-field-help">
                    Maximum {completedRemainingUnits} unit
                    {completedRemainingUnits === 1 ? "" : "s"}
                    available for this request.
                  </span>
                </div>

                <div className="hospital-donation-field">
                  <label htmlFor="donation_date">
                    Donation date &amp; time
                  </label>

                  <input
                    id="donation_date"
                    name="donation_date"
                    type="datetime-local"
                    value={donationForm.donation_date}
                    onChange={handleDonationFormChange}
                    required
                  />
                </div>
              </div>

              <div className="hospital-donation-field hospital-donation-notes-field">
                <label htmlFor="donation_notes">
                  Notes <span>(optional)</span>
                </label>

                <textarea
                  id="donation_notes"
                  name="notes"
                  rows="4"
                  value={donationForm.notes}
                  onChange={handleDonationFormChange}
                  placeholder="Add any relevant donation notes..."
                />

                <span className="hospital-donation-field-help">
                  Optional information for the hospital's donation record.
                </span>
              </div>

              {/* Footer */}
              <div className="hospital-donation-modal-footer">
                <button
                  type="button"
                  className="hospital-secondary-button"
                  onClick={closeDonationModal}
                  disabled={savingDonation}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="hospital-primary-button"
                  disabled={savingDonation}
                >
                  {savingDonation
                    ? "Recording…"
                    : "Record Donation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}