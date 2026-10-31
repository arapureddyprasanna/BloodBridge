import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { showToast } from "../../App";

const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

const URGENCY_OPTIONS = [
  { value: "normal", label: "Routine" },
  { value: "urgent", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "matching", label: "Matching" },
  {
    value: "partially_fulfilled",
    label: "Partially fulfilled",
  },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

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
  const option = URGENCY_OPTIONS.find(
    (item) => item.value === value
  );

  return option ? option.label : value || "Routine";
}

function getStatusLabel(value) {
  const option = STATUS_OPTIONS.find(
    (item) => item.value === value
  );

  return option ? option.label : value || "Unknown";
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
  switch (urgency) {
    case "critical":
      return "hospital-badge hospital-badge-danger";

    case "urgent":
      return "hospital-badge hospital-badge-warning";

    default:
      return "hospital-badge hospital-badge-muted";
  }
}

function isActiveStatus(status) {
  return [
    "open",
    "matching",
    "partially_fulfilled",
  ].includes(status);
}

export default function HospitalRequests() {
  const navigate = useNavigate();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [urgency, setUrgency] = useState("");
  const [status, setStatus] = useState("");

  const [sortBy, setSortBy] = useState("newest");

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigate("/login", { replace: true });
        return;
      }

      const token = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/hospital/blood-requests/`,
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

      if (!response.ok) {
        let message = "Unable to load blood requests.";

        try {
          const data = await response.json();

          if (data?.detail) {
            message = data.detail;
          }
        } catch {
          // Keep default error message.
        }

        throw new Error(message);
      }

      const data = await response.json();

      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load hospital blood requests:", error);

      showToast(
        error.message || "Unable to load blood requests.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = requests.filter((request) => {
      const matchesSearch =
        !normalizedSearch ||
        formatRequestId(request.id)
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(request.id)
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(request.blood_group || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(request.hospital_notes || "")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesBloodGroup =
        !bloodGroup ||
        request.blood_group === bloodGroup;

      const matchesUrgency =
        !urgency ||
        request.urgency === urgency;

      const matchesStatus =
        !status ||
        request.status === status;

      return (
        matchesSearch &&
        matchesBloodGroup &&
        matchesUrgency &&
        matchesStatus
      );
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();

      if (sortBy === "oldest") {
        return dateA - dateB;
      }

      if (sortBy === "required_soonest") {
        const requiredA = a.required_by
          ? new Date(a.required_by).getTime()
          : Number.MAX_SAFE_INTEGER;

        const requiredB = b.required_by
          ? new Date(b.required_by).getTime()
          : Number.MAX_SAFE_INTEGER;

        return requiredA - requiredB;
      }

      if (sortBy === "urgency") {
        const priority = {
          critical: 1,
          urgent: 2,
          normal: 3,
        };

        return (
          (priority[a.urgency] || 99) -
          (priority[b.urgency] || 99)
        );
      }

      return dateB - dateA;
    });
  }, [
    requests,
    search,
    bloodGroup,
    urgency,
    status,
    sortBy,
  ]);

  const summary = useMemo(() => {
    const active = requests.filter((request) =>
      isActiveStatus(request.status)
    ).length;

    const fulfilled = requests.filter(
      (request) => request.status === "fulfilled"
    ).length;

    const urgent = requests.filter(
      (request) =>
        isActiveStatus(request.status) &&
        ["urgent", "critical"].includes(request.urgency)
    ).length;

    const totalUnits = requests
      .filter((request) => isActiveStatus(request.status))
      .reduce(
        (total, request) =>
          total + Number(request.units_required || 0),
        0
      );

    return {
      total: requests.length,
      active,
      fulfilled,
      urgent,
      totalUnits,
    };
  }, [requests]);

  const resetFilters = () => {
    setSearch("");
    setBloodGroup("");
    setUrgency("");
    setStatus("");
    setSortBy("newest");
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;

    try {
      setCancelling(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigate("/login", { replace: true });
        return;
      }

      const token = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/hospital/blood-requests/${cancelTarget.id}/cancel/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail || "Unable to cancel this request."
        );
      }

      setRequests((currentRequests) =>
        currentRequests.map((request) =>
          request.id === cancelTarget.id
            ? {
                ...request,
                status: "cancelled",
              }
            : request
        )
      );

      setCancelTarget(null);

      showToast("Blood request cancelled successfully.");
    } catch (error) {
      console.error(
        "Failed to cancel blood request:",
        error
      );

      showToast(
        error.message || "Unable to cancel this request.",
        "error"
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="hospital-page">
      <div className="hospital-page-header">
        <div>
          <p className="hospital-page-eyebrow">
            Hospital workspace
          </p>

          <h1 className="hospital-page-title">
            Blood Requests
          </h1>

          <p className="hospital-page-subtitle">
            Create, monitor, and manage your hospital's blood
            requests.
          </p>
        </div>

        <div className="hospital-page-actions">
          <button
            type="button"
            className="hospital-secondary-button"
            onClick={loadRequests}
            disabled={loading}
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            className="hospital-primary-button"
            onClick={() => navigate("/requests/create")}
          >
            + Create Blood Request
          </button>
        </div>
      </div>

      <div className="hospital-kpi-grid">
        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">
            🩸
          </div>

          <div>
            <p className="hospital-kpi-label">
              Total Requests
            </p>

            <p className="hospital-kpi-value">
              {summary.total}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">
            ◷
          </div>

          <div>
            <p className="hospital-kpi-label">
              Active Requests
            </p>

            <p className="hospital-kpi-value">
              {summary.active}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">
            !
          </div>

          <div>
            <p className="hospital-kpi-label">
              Urgent Requests
            </p>

            <p className="hospital-kpi-value">
              {summary.urgent}
            </p>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">
            ✓
          </div>

          <div>
            <p className="hospital-kpi-label">
              Fulfilled
            </p>

            <p className="hospital-kpi-value">
              {summary.fulfilled}
            </p>
          </div>
        </div>
      </div>

      <section className="hospital-card">
        <div className="hospital-card-header">
          <div>
            <h2 className="hospital-card-title">
              Request History
            </h2>

            <p className="hospital-card-subtitle">
              {filteredRequests.length} request
              {filteredRequests.length === 1 ? "" : "s"} shown
              {summary.totalUnits > 0
                ? ` • ${summary.totalUnits} active units required`
                : ""}
            </p>
          </div>
        </div>

        <div className="hospital-filter-bar">
          <div className="hospital-search-wrapper">
            <span className="hospital-search-icon">
              ⌕
            </span>

            <input
              type="text"
              className="hospital-input hospital-search-input"
              placeholder="Search request ID, blood group, or notes"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <select
            className="hospital-select"
            value={bloodGroup}
            onChange={(event) =>
              setBloodGroup(event.target.value)
            }
          >
            <option value="">All blood groups</option>

            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>

          <select
            className="hospital-select"
            value={urgency}
            onChange={(event) =>
              setUrgency(event.target.value)
            }
          >
            <option value="">All urgency</option>

            {URGENCY_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="hospital-select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value)
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option
                key={option.value || "all"}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="hospital-select"
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value)
            }
          >
            <option value="newest">
              Newest first
            </option>

            <option value="oldest">
              Oldest first
            </option>

            <option value="required_soonest">
              Required soonest
            </option>

            <option value="urgency">
              Highest urgency
            </option>
          </select>

          {(search ||
            bloodGroup ||
            urgency ||
            status ||
            sortBy !== "newest") && (
            <button
              type="button"
              className="hospital-text-button"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="hospital-loading">
            <div className="hospital-loading-spinner" />
            <p>Loading blood requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="hospital-empty-state">
            <div className="hospital-empty-icon">
              🩸
            </div>

            <h3>
              {requests.length === 0
                ? "No blood requests yet"
                : "No requests match your filters"}
            </h3>

            <p>
              {requests.length === 0
                ? "Create your first blood request to start coordinating compatible donors."
                : "Try adjusting your search or filters to find the request you're looking for."}
            </p>

            {requests.length === 0 ? (
              <button
                type="button"
                className="hospital-primary-button"
                onClick={() =>
                  navigate("/requests/create")
                }
              >
                + Create Blood Request
              </button>
            ) : (
              <button
                type="button"
                className="hospital-secondary-button"
                onClick={resetFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="hospital-table-wrapper">
            <table className="hospital-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Blood Group</th>
                  <th>Units</th>
                  <th>Urgency</th>
                  <th>Required By</th>
                  <th>Status</th>
                  <th className="hospital-table-actions-column">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="hospital-table-primary">
                        {formatRequestId(request.id)}
                      </div>

                      <div className="hospital-table-secondary">
                        Created{" "}
                        {formatDateTime(
                          request.created_at
                        )}
                      </div>
                    </td>

                    <td>
                      <span className="hospital-blood-group">
                        {request.blood_group}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {request.units_required}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={getUrgencyClass(
                          request.urgency
                        )}
                      >
                        {getUrgencyLabel(
                          request.urgency
                        )}
                      </span>
                    </td>

                    <td>
                      <span className="hospital-table-secondary">
                        {formatDateTime(
                          request.required_by
                        )}
                      </span>
                    </td>

                    <td>
                      <span
                        className={getStatusClass(
                          request.status
                        )}
                      >
                        {getStatusLabel(
                          request.status
                        )}
                      </span>
                    </td>

                    <td>
                      <div className="hospital-table-actions">
                        <button
                          type="button"
                          className="hospital-action-button"
                          onClick={() =>
                            navigate(
                              `/requests/${request.id}`
                            )
                          }
                        >
                          View
                        </button>

                        {isActiveStatus(
                          request.status
                        ) && (
                          <button
                            type="button"
                            className="hospital-action-button hospital-action-button-danger"
                            onClick={() =>
                              setCancelTarget(request)
                            }
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cancelTarget && (
        <div
          className="hospital-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCancelTarget(null);
            }
          }}
        >
          <div className="hospital-modal">
            <div className="hospital-modal-header">
              <div>
                <p className="hospital-page-eyebrow">
                  Blood request
                </p>

                <h2 className="hospital-modal-title">
                  Cancel request?
                </h2>
              </div>

              <button
                type="button"
                className="hospital-modal-close"
                onClick={() =>
                  setCancelTarget(null)
                }
                disabled={cancelling}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="hospital-modal-body">
              <p>
                You are about to cancel{" "}
                <strong>
                  {formatRequestId(cancelTarget.id)}
                </strong>{" "}
                for{" "}
                <strong>
                  {cancelTarget.blood_group}
                </strong>{" "}
                blood and{" "}
                <strong>
                  {cancelTarget.units_required}
                </strong>{" "}
                unit
                {Number(cancelTarget.units_required) === 1
                  ? ""
                  : "s"}
                .
              </p>

              <p className="hospital-modal-warning">
                A cancelled request cannot be used for donor
                coordination.
              </p>
            </div>

            <div className="hospital-modal-actions">
              <button
                type="button"
                className="hospital-secondary-button"
                onClick={() =>
                  setCancelTarget(null)
                }
                disabled={cancelling}
              >
                Keep Request
              </button>

              <button
                type="button"
                className="hospital-danger-button"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling
                  ? "Cancelling..."
                  : "Cancel Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
