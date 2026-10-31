import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { showToast } from "../../App";

function HospitalDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const user = auth.currentUser;

        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const token = await user.getIdToken();

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [profileResponse, requestsResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/auth/me/`, {
              headers,
            }),
            fetch(`${API_BASE_URL}/hospital/blood-requests/`, {
              headers,
            }),
          ]);

        if (!profileResponse.ok) {
          throw new Error(
            "Unable to load hospital profile."
          );
        }

        if (!requestsResponse.ok) {
          throw new Error(
            "Unable to load blood requests."
          );
        }

        const profileData = await profileResponse.json();
        const requestsData =
          await requestsResponse.json();

        setProfile(profileData);

        setRequests(
          Array.isArray(requestsData)
            ? requestsData
            : requestsData.results || []
        );
      } catch (error) {
        console.error(
          "Hospital dashboard loading failed:",
          error
        );

        showToast(
          error.message ||
            "Unable to load hospital dashboard.",
          "error"
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navigate]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activeRequests = useMemo(
    () =>
      requests.filter((request) =>
        [
          "open",
          "matching",
          "partially_fulfilled",
        ].includes(request.status)
      ),
    [requests]
  );

  const pendingRequests = useMemo(
    () =>
      requests.filter((request) =>
        ["open", "matching"].includes(request.status)
      ),
    [requests]
  );

  const fulfilledRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "fulfilled"
      ),
    [requests]
  );

  const urgentRequests = useMemo(
    () =>
      activeRequests.filter((request) =>
        ["urgent", "critical"].includes(
          request.urgency
        )
      ),
    [activeRequests]
  );

  const totalActiveUnits = useMemo(
    () =>
      activeRequests.reduce(
        (total, request) =>
          total + Number(request.units_required || 0),
        0
      ),
    [activeRequests]
  );

  const mostRequestedBloodGroup = useMemo(() => {
    const totals = requests.reduce((counts, request) => {
      if (request.blood_group) {
        counts[request.blood_group] = (counts[request.blood_group] || 0) + 1;
      }
      return counts;
    }, {});
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || null;
  }, [requests]);

  const getHospitalName = () => {
    if (!profile?.full_name) {
      return "Hospital";
    }

    return profile.full_name;
  };

  const getUrgencyLabel = (urgency) => {
    const labels = {
      normal: "Routine",
      urgent: "High",
      critical: "Critical",
    };

    return labels[urgency] || urgency;
  };

  const getStatusLabel = (status) => {
    const labels = {
      open: "Awaiting donors",
      matching: "Coordinating",
      partially_fulfilled: "Partially fulfilled",
      fulfilled: "Fulfilled",
      cancelled: "Cancelled",
      expired: "Expired",
    };

    return labels[status] || status;
  };

  const getUrgencyClass = (urgency) => {
    if (urgency === "critical") {
      return "critical";
    }

    if (urgency === "urgent") {
      return "urgent";
    }

    return "routine";
  };

  const getStatusClass = (status) => {
    if (status === "fulfilled") {
      return "fulfilled";
    }

    if (status === "partially_fulfilled") {
      return "partial";
    }

    if (
      status === "cancelled" ||
      status === "expired"
    ) {
      return "closed";
    }

    return "active";
  };

  const formatDate = (dateValue) => {
    if (!dateValue) {
      return "Not specified";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "Not specified";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatRelativeTime = (dateValue) => {
    if (!dateValue) {
      return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const difference = Date.now() - date.getTime();

    const minutes = Math.floor(
      difference / 60000
    );

    if (minutes < 1) {
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours} hr ago`;
    }

    const days = Math.floor(hours / 24);

    if (days === 1) {
      return "Yesterday";
    }

    return `${days} days ago`;
  };

  if (loading) {
    return (
      <section className="hospital-dashboard">
        <div className="hospital-dashboard-loading">
          <div className="hospital-loading-spinner" />
          <span>
            Loading hospital dashboard...
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="hospital-dashboard">
      {/* =========================
          WELCOME
      ========================= */}

      <div className="hospital-dashboard-header">
        <div>
          <span className="hospital-eyebrow">
            Hospital overview
          </span>

          <h2>
            Welcome back, {getHospitalName()}.
          </h2>

          <p>
            Every connection brings care closer.
            Here&apos;s your hospital overview.
          </p>
        </div>

        <button
          type="button"
          className="hospital-refresh-button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
        >
          <span
            className={
              refreshing
                ? "hospital-refresh-icon spinning"
                : "hospital-refresh-icon"
            }
          >
            ↻
          </span>

          {refreshing
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </div>

      {/* =========================
          KPI CARDS
      ========================= */}

      <div className="hospital-kpi-grid">
        <article className="hospital-kpi-card">
          <div className="hospital-kpi-top">
            <span>Active Requests</span>

            <span className="hospital-kpi-icon blood">
              +
            </span>
          </div>

          <strong>{activeRequests.length}</strong>

          <div className="hospital-kpi-meta">
            <span
              className={
                urgentRequests.length > 0
                  ? "hospital-kpi-alert"
                  : ""
              }
            >
              {urgentRequests.length} need urgent
              attention
            </span>
          </div>
        </article>

        <article className="hospital-kpi-card">
          <div className="hospital-kpi-top">
            <span>Pending Requests</span>

            <span className="hospital-kpi-icon clock">
              ◷
            </span>
          </div>

          <strong>{pendingRequests.length}</strong>

          <div className="hospital-kpi-meta">
            <span>Awaiting coordination</span>
          </div>
        </article>

        <article className="hospital-kpi-card">
          <div className="hospital-kpi-top">
            <span>Fulfilled Requests</span>

            <span className="hospital-kpi-icon check">
              ✓
            </span>
          </div>

          <strong>{fulfilledRequests.length}</strong>

          <div className="hospital-kpi-meta">
            <span>
              {fulfilledRequests.reduce(
                (total, request) =>
                  total +
                  Number(
                    request.units_required || 0
                  ),
                0
              )}{" "}
              units recorded
            </span>
          </div>
        </article>
      </div>

      {/* =========================
          MAIN DASHBOARD GRID
      ========================= */}

      <div className="hospital-dashboard-grid">
        {/* ACTIVE REQUESTS */}

        <article className="hospital-dashboard-card hospital-active-card">
          <div className="hospital-card-header">
            <div>
              <h3>Active Blood Requests</h3>

              <p>
                {activeRequests.length} open request
                {activeRequests.length === 1
                  ? ""
                  : "s"}{" "}
                • {totalActiveUnits} units required
              </p>
            </div>

            <button
              type="button"
              className="hospital-card-action"
              onClick={() => navigate("/requests")}
            >
              View all
              <span>→</span>
            </button>
          </div>

          {activeRequests.length === 0 ? (
            <div className="hospital-empty-state">
              <div className="hospital-empty-icon">
                +
              </div>

              <strong>
                No active blood requests
              </strong>

              <span>
                Create a request when your hospital
                needs blood support.
              </span>

              <button
                type="button"
                onClick={() =>
                  navigate("/requests/create")
                }
              >
                Create Blood Request
              </button>
            </div>
          ) : (
            <div className="hospital-request-list">
              {activeRequests
                .slice(0, 5)
                .map((request) => (
                  <button
                    type="button"
                    key={request.id}
                    className="hospital-request-row"
                    onClick={() =>
                      navigate(
                        `/requests/${request.id}`
                      )
                    }
                  >
                    <div className="hospital-request-blood">
                      <span
                        className={`hospital-blood-badge ${getUrgencyClass(
                          request.urgency
                        )}`}
                      >
                        {request.blood_group}
                      </span>

                      <div>
                        <strong>
                          {request.blood_group} request
                        </strong>

                        <span>
                          {request.units_required}{" "}
                          {request.units_required === 1
                            ? "unit"
                            : "units"}{" "}
                          required
                        </span>
                      </div>
                    </div>

                    <div className="hospital-request-middle">
                      <span
                        className={`hospital-urgency-badge ${getUrgencyClass(
                          request.urgency
                        )}`}
                      >
                        {getUrgencyLabel(
                          request.urgency
                        )}
                      </span>

                      <span
                        className={`hospital-status-badge ${getStatusClass(
                          request.status
                        )}`}
                      >
                        {getStatusLabel(
                          request.status
                        )}
                      </span>
                    </div>

                    <div className="hospital-request-date">
                      <span>
                        {formatDate(
                          request.required_by
                        )}
                      </span>

                      <small>
                        {formatRelativeTime(
                          request.created_at
                        )}
                      </small>
                    </div>

                    <span className="hospital-row-arrow">
                      →
                    </span>
                  </button>
                ))}
            </div>
          )}
        </article>

        {/* RIGHT COLUMN */}

        <div className="hospital-dashboard-side">
          {/* TOP COMMUNITY */}

          <article className="hospital-dashboard-card hospital-community-card">
            <div className="hospital-card-header compact">
              <div>
                <span className="hospital-card-label">
                  Request summary
                </span>

                <h3>
                  Most Requested Blood Group
                </h3>
              </div>

              <span className="hospital-community-icon">
                ♥
              </span>
            </div>

            <div className="hospital-community-placeholder">
              <div className="hospital-community-avatar">
                {mostRequestedBloodGroup?.[0] || "—"}
              </div>

              <div>
                <strong>
                  {mostRequestedBloodGroup
                    ? `${mostRequestedBloodGroup[0]} is most requested`
                    : "No blood requests yet"}
                </strong>

                <span>
                  {mostRequestedBloodGroup
                    ? `${mostRequestedBloodGroup[1]} request${mostRequestedBloodGroup[1] === 1 ? "" : "s"} in your history`
                    : "Create a blood request to see your request summary."}
                </span>
              </div>
            </div>

            <div className="hospital-community-note">
              Summary based on {requests.length} request{requests.length === 1 ? "" : "s"} loaded from your hospital account.
            </div>
          </article>

          {/* URGENT REQUESTS */}

          <article className="hospital-dashboard-card hospital-urgent-card">
            <div className="hospital-card-header compact">
              <div>
                <span className="hospital-card-label">
                  Priority
                </span>

                <h3>Urgent Requests</h3>

                <p>
                  Blood requests requiring
                  attention
                </p>
              </div>

              <span className="hospital-kpi-icon blood">
                !
              </span>
            </div>

            {urgentRequests.length === 0 ? (
              <div className="hospital-empty-state">
                <div className="hospital-empty-icon">
                  ✓
                </div>

                <strong>
                  No urgent requests
                </strong>

                <span>
                  Urgent requests will appear here
                  when they require immediate
                  attention.
                </span>
              </div>
            ) : (
              <div className="hospital-request-list">
                {urgentRequests
                  .slice(0, 3)
                  .map((request) => (
                    <button
                      type="button"
                      key={request.id}
                      className="hospital-request-row"
                      onClick={() =>
                        navigate(
                          `/requests/${request.id}`
                        )
                      }
                    >
                      <div className="hospital-request-blood">
                        <span
                          className={`hospital-blood-badge ${getUrgencyClass(
                            request.urgency
                          )}`}
                        >
                          {request.blood_group}
                        </span>

                        <div>
                          <strong>
                            {request.blood_group}{" "}
                            request
                          </strong>

                          <span>
                            {request.units_required}{" "}
                            {request.units_required ===
                            1
                              ? "unit"
                              : "units"}{" "}
                            required
                          </span>
                        </div>
                      </div>

                      <div className="hospital-request-middle">
                        <span
                          className={`hospital-urgency-badge ${getUrgencyClass(
                            request.urgency
                          )}`}
                        >
                          {getUrgencyLabel(
                            request.urgency
                          )}
                        </span>
                      </div>

                      <span className="hospital-row-arrow">
                        →
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </article>

          {/* QUICK ACTIONS */}

          <article className="hospital-dashboard-card">
            <div className="hospital-card-header compact">
              <div>
                <span className="hospital-card-label">
                  Shortcuts
                </span>

                <h3>Quick Actions</h3>
              </div>
            </div>

            <div className="hospital-quick-actions">
              <button
                type="button"
                onClick={() =>
                  navigate("/requests/create")
                }
              >
                <span className="hospital-quick-icon">
                  +
                </span>

                <span>
                  <strong>
                    Create Blood Request
                  </strong>

                  <small>
                    Request compatible donors
                  </small>
                </span>

                <span>→</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate("/requests")
                }
              >
                <span className="hospital-quick-icon">
                  ◷
                </span>

                <span>
                  <strong>
                    View Requests
                  </strong>

                  <small>
                    Manage your blood requests
                  </small>
                </span>

                <span>→</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  document
                    .querySelector(
                      ".bb-admin-notification-button"
                    )
                    ?.click()
                }
              >
                <span className="hospital-quick-icon">
                  ♢
                </span>

                <span>
                  <strong>
                    Notifications
                  </strong>

                  <small>
                    View recent updates
                  </small>
                </span>

                <span>→</span>
              </button>
            </div>
          </article>
        </div>
      </div>

      {/* =========================
          RECENT ACTIVITY
      ========================= */}

      <article className="hospital-dashboard-card hospital-activity-card">
        <div className="hospital-card-header">
          <div>
            <span className="hospital-card-label">
              Latest updates
            </span>

            <h3>Recent Activity</h3>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="hospital-activity-empty">
            No recent request activity yet.
          </div>
        ) : (
          <div className="hospital-activity-list">
            {requests.slice(0, 5).map((request) => (
              <button
                type="button"
                key={request.id}
                className="hospital-activity-item"
                onClick={() =>
                  navigate(
                    `/requests/${request.id}`
                  )
                }
              >
                <span
                  className={`hospital-activity-icon ${getStatusClass(
                    request.status
                  )}`}
                >
                  {request.status === "fulfilled"
                    ? "✓"
                    : "+"}
                </span>

                <span className="hospital-activity-content">
                  <strong>
                    {request.blood_group} blood
                    request
                  </strong>

                  <small>
                    {request.units_required}{" "}
                    {request.units_required === 1
                      ? "unit"
                      : "units"}{" "}
                    •{" "}
                    {getStatusLabel(
                      request.status
                    )}
                  </small>
                </span>

                <span className="hospital-activity-time">
                  {formatRelativeTime(
                    request.updated_at
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default HospitalDashboard;
