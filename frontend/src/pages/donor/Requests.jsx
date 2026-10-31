import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import {
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDateTime,
} from "./DonorComponents";
import "./DonorWorkspace.css";

export default function DonorRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [respondingId, setRespondingId] = useState(null);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;

      if (!user) {
        setRequests([]);
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/donor/requests/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to load your requests."
        );
      }

      setRequests(
        Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : []
      );
    } catch (error) {
      console.error("Donor requests load failed:", error);

      showToast(
        error.message || "Unable to load your requests.",
        "error"
      );

      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filters = [
    "All",
    "Awaiting",
    "Accepted",
    "Declined",
    "Closed",
  ];

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requests.filter((request) => {
      const status = String(
        request?.status || "pending"
      ).toLowerCase();

      const matchesFilter =
        activeFilter === "All" ||
        (activeFilter === "Awaiting" &&
          status === "pending") ||
        (activeFilter === "Accepted" &&
          status === "accepted") ||
        (activeFilter === "Declined" &&
          status === "declined") ||
        (activeFilter === "Closed" &&
          ["expired", "cancelled"].includes(status));

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        request.hospital_name,
        request.hospital,
        request.blood_group,
        request.blood_request_id,
        request.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activeFilter, requests, search]);

  const respond = async (request, decision) => {
    const user = auth.currentUser;

    if (!user) {
      showToast(
        "Please sign in again to continue.",
        "error"
      );
      return;
    }

    try {
      setRespondingId(request.invitation_id);

      const token = await user.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/donor/requests/${request.blood_request_id}/${decision}/`,
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
          `Invitation ${decision}ed successfully.`,
        "success"
      );

      await loadRequests();
    } catch (error) {
      console.error(
        `Invitation ${decision} failed:`,
        error
      );

      showToast(
        error.message ||
          `Unable to ${decision} this invitation.`,
        "error"
      );
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bb-page-shell">
        <PageHeader
          eyebrow="DONATION WORKSPACE"
          title="Requests for You"
          subtitle="Review hospital invitations selected for your donor profile."
        />

        <LoadingState message="Loading donor requests..." />
      </div>
    );
  }

  return (
    <div className="bb-page-shell">
      <PageHeader
        eyebrow="DONATION WORKSPACE"
        title="Requests for You"
        subtitle="Review real hospital invitations selected for your donor profile and respond when you are available."
      />

      <div className="bb-request-overview">
        <div className="bb-request-overview-copy">
          <span className="bb-request-overview-label">
            YOUR DONOR INBOX
          </span>

          <h2>
            {filteredRequests.length}{" "}
            {filteredRequests.length === 1
              ? "request"
              : "requests"}
          </h2>

          <p>
            Hospitals can invite you when your blood
            group and availability match an urgent need.
          </p>
        </div>

        <div className="bb-request-overview-stats">
          <div>
            <strong>
              {
                requests.filter(
                  (item) =>
                    item.status === "pending"
                ).length
              }
            </strong>
            <span>Awaiting response</span>
          </div>

          <div>
            <strong>
              {
                requests.filter(
                  (item) =>
                    item.status === "accepted"
                ).length
              }
            </strong>
            <span>Accepted</span>
          </div>

          <div>
            <strong>{requests.length}</strong>
            <span>Total invitations</span>
          </div>
        </div>
      </div>

      <FilterBar
        search={search}
        setSearch={setSearch}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        filters={filters}
        placeholder="Search hospital, blood group or request ID"
      />

      {filteredRequests.length === 0 ? (
        <EmptyState
          title="No requests available right now"
          message={
            search || activeFilter !== "All"
              ? "No invitations match your current search or filter."
              : "Your donor inbox is clear for now. When a hospital sends a request or invitation, it will appear here."
          }
          icon="♡"
        />
      ) : (
        <div className="bb-donor-request-list">
          {filteredRequests.map((request) => {
            const status = String(
              request.status || "pending"
            ).toLowerCase();

            const busy =
              respondingId ===
              request.invitation_id;

            return (
              <article
                key={request.invitation_id}
                className="bb-donor-request-card"
              >
                <div className="bb-donor-request-main">
                  <div className="bb-donor-request-blood">
                    <span>Blood group</span>
                    <strong>
                      {request.blood_group || "—"}
                    </strong>
                  </div>

                  <div className="bb-donor-request-content">
                    <div className="bb-donor-request-heading">
                      <div>
                        <span className="bb-request-label">
                          HOSPITAL INVITATION
                        </span>

                        <h2>
                          {request.hospital_name ||
                            request.hospital ||
                            "Hospital"}
                        </h2>
                      </div>

                      <StatusBadge
                        status={status}
                      />
                    </div>

                    <div className="bb-donor-request-meta">
                      <span>
                        📍{" "}
                        {[
                          request.hospital_city,
                          request.hospital_state,
                        ]
                          .filter(Boolean)
                          .join(", ") ||
                          "Location unavailable"}
                      </span>

                      <span>
                        {request.units_required ||
                          "—"}{" "}
                        units needed
                      </span>

                      {request.distance_km != null && (
                        <span>
                          {request.distance_km} km away
                        </span>
                      )}
                    </div>

                    <div className="bb-donor-request-details">
                      <div>
                        <span>Urgency</span>
                        <strong>
                          {request.urgency ||
                            "Standard"}
                        </strong>
                      </div>

                      <div>
                        <span>Required by</span>
                        <strong>
                          {formatDateTime(
                            request.required_by
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Request ID</span>
                        <strong>
                          {String(
                            request.blood_request_id ||
                              request.invitation_id ||
                              ""
                          )
                            .slice(0, 8)
                            .toUpperCase()}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bb-donor-request-footer">
                  <Link
                    className="bb-secondary-button"
                    to={`/donor/requests/${request.blood_request_id}`}
                  >
                    View details
                  </Link>

                  {status === "pending" && (
                    <div className="bb-donor-request-actions">
                      <button
                        type="button"
                        className="bb-secondary-button bb-donor-decline-button"
                        disabled={busy}
                        onClick={() =>
                          respond(
                            request,
                            "decline"
                          )
                        }
                      >
                        {busy
                          ? "Updating..."
                          : "Decline"}
                      </button>

                      <button
                        type="button"
                        className="bb-primary-button"
                        disabled={busy}
                        onClick={() =>
                          respond(
                            request,
                            "accept"
                          )
                        }
                      >
                        {busy
                          ? "Updating..."
                          : "Accept request"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}