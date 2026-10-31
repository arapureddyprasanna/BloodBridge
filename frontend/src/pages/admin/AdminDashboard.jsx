import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { auth } from "../../firebase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import "./AdminDashboard.css";

const STAT_CARDS = [
  {
    key: "total_users",
    label: "Total users",
    description: "Registered platform accounts",
    icon: "♙",
  },
  {
    key: "verified_hospitals",
    label: "Verified hospitals",
    description: "Approved hospital accounts",
    icon: "✚",
  },
  {
    key: "registered_communities",
    label: "Verified communities",
    description: "Registered community accounts",
    icon: "♧",
  },
  {
    key: "blood_requests",
    label: "Active blood requests",
    description: "Requests recorded on platform",
    icon: "♡",
  },
];

const ROLE_LABELS = {
  super_admin: "Super Admin",
  hospital_admin: "Hospital",
  community_admin: "Community",
  donor: "Donor",
};

const numberFormat = new Intl.NumberFormat("en-IN");

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? numberFormat.format(value)
    : "—";
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function EmptyState({ message }) {
  return <div className="admin-empty-state">{message}</div>;
}

function getStats(data) {
  const stats = data?.statistics || data || {};

  return {
    total_users: stats.total_users,
    verified_hospitals: stats.verified_hospitals,
    registered_communities: stats.registered_communities,
    blood_requests: stats.blood_requests,
    pending_verifications:
      stats.pending_verifications ??
      (typeof stats.pending_hospitals === "number" &&
      typeof stats.pending_communities === "number"
        ? stats.pending_hospitals + stats.pending_communities
        : undefined),
  };
}

function StatusBadge({ status }) {
  const normalized = String(status || "unknown")
    .toLowerCase()
    .replaceAll(" ", "_");

  const labelMap = {
    pending: "Pending",
    active: "Active",
    verified: "Verified",
    approved: "Verified",
    rejected: "Rejected",
    suspended: "Suspended",
    awaiting_review: "Pending",
  };

  return (
    <span className={`admin-status-badge status-${normalized}`}>
      {labelMap[normalized] || normalized.replaceAll("_", " ")}
    </span>
  );
}

function UrgencyBadge({ urgency }) {
  const normalized = String(urgency || "normal").toLowerCase();

  return (
    <span className={`admin-urgency-badge urgency-${normalized}`}>
      {normalized.replaceAll("_", " ")}
    </span>
  );
}

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const token = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/superadmin/dashboard/`,
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
          data.detail ||
            `Unable to load dashboard (HTTP ${response.status}).`
        );
      }

      setDashboard(data);
    } catch (err) {
      setError(err.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = getStats(dashboard);
  const userGrowth = dashboard?.user_growth || [];

  const donationsTrend =
    dashboard?.completed_donations_trend ||
    dashboard?.donations_trend ||
    [];

  const registrations = dashboard?.recent_registrations || [];

  const urgentRequests =
    dashboard?.urgent_requests ||
    dashboard?.critical_requests ||
    [];

  const pendingCount = stats.pending_verifications;

  return (
    <main className="admin-dashboard">
      <section className="admin-page-heading">
        <div>
          <div className="admin-breadcrumb">
            <span>Administration</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Overview</span>
          </div>

          <h1>Super Admin Overview</h1>

          <p className="admin-page-subtitle">
            Monitor platform activity, registrations, and blood donation
            operations.
          </p>
        </div>

        <div className="admin-heading-actions">
          <span className="admin-date-range">
            <span aria-hidden="true">▦</span>
            Last 30 days
            <span className="date-range-chevron">⌄</span>
          </span>

          <button
            className="admin-refresh-button"
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={loading || refreshing}
          >
            <span aria-hidden="true">↻</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {error && (
        <section className="admin-error" role="alert">
          <div>
            <strong>Dashboard could not be loaded</strong>
            <p>{error}</p>
          </div>

          <button
            type="button"
            onClick={() => loadDashboard()}
          >
            Try again
          </button>
        </section>
      )}

      <section
        className="admin-stats-grid"
        aria-label="Platform statistics"
      >
        {STAT_CARDS.map((card) => (
          <article className="admin-stat-card" key={card.key}>
            <div className="admin-stat-heading">
              <p className="admin-stat-label">{card.label}</p>

              <span className="admin-stat-icon" aria-hidden="true">
                {card.icon}
              </span>
            </div>

            <strong className="admin-stat-value">
              {loading ? "—" : formatNumber(stats[card.key])}
            </strong>

            <p className="admin-stat-description">
              {card.description}
            </p>
          </article>
        ))}
      </section>

      <section className="admin-verification-banner">
        <div className="admin-banner-icon" aria-hidden="true">
          ✓
        </div>

        <div className="admin-banner-copy">
          <h2>
            {loading
              ? "Checking verification queue…"
              : `${formatNumber(pendingCount)} applications awaiting verification`}
          </h2>

          <p>
            Review pending hospital and community applications to keep the
            BloodBridge network verified.
          </p>
        </div>

        <div className="admin-banner-actions">
          <a href="/admin/hospitals">
            Review hospitals <span aria-hidden="true">→</span>
          </a>

          <a href="/admin/communities">
            Review communities <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <section className="admin-charts-grid">
        <article className="admin-panel admin-chart-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Network activity</h2>
              <p>Platform registration growth over time</p>
            </div>

            <span className="admin-panel-icon" aria-hidden="true">
              ↗
            </span>
          </div>

          {userGrowth.length > 0 ? (
            <div className="admin-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={userGrowth}
                  margin={{ top: 10, right: 12, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#EEE8E2"
                    strokeDasharray="3 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#756868", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#756868", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E6DED7",
                      fontSize: 12,
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Registrations"
                    stroke="#7A1F2B"
                    strokeWidth={2.5}
                    dot={{
                      r: 3,
                      fill: "#FFFFFF",
                      stroke: "#7A1F2B",
                      strokeWidth: 2,
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              message={
                loading
                  ? "Loading network activity…"
                  : "Network activity will appear when monthly registration data is available."
              }
            />
          )}
        </article>

        <article className="admin-panel admin-chart-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Completed donations</h2>
              <p>Donation completion trends over time</p>
            </div>

            <span className="admin-panel-icon" aria-hidden="true">
              ♡
            </span>
          </div>

          {donationsTrend.length > 0 ? (
            <div className="admin-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={donationsTrend}
                  margin={{ top: 10, right: 12, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#EEE8E2"
                    strokeDasharray="3 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#756868", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#756868", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E6DED7",
                      fontSize: 12,
                    }}
                  />

                  <Bar
                    dataKey="total"
                    name="Completed donations"
                    fill="#B97878"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              message={
                loading
                  ? "Loading donation trends…"
                  : "Donation trends will appear when the API provides completed donation data."
              }
            />
          )}
        </article>
      </section>

      <section className="admin-bottom-grid">
        <article className="admin-panel admin-table-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Recent registrations</h2>
              <p>Latest accounts registered on BloodBridge</p>
            </div>

            <span className="admin-section-count">
              {registrations.length}
            </span>
          </div>

          {registrations.length > 0 ? (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {registrations.map((user, index) => (
                    <tr key={user.id || user.email || index}>
                      <td>
                        <div className="admin-user-cell">
                          <span className="admin-user-avatar">
                            {String(
                              user.full_name || user.name || "U"
                            )
                              .trim()
                              .charAt(0)
                              .toUpperCase()}
                          </span>

                          <span className="admin-user-details">
                            <strong>
                              {user.full_name || user.name || "—"}
                            </strong>

                            <span className="admin-table-email">
                              {user.email || "—"}
                            </span>
                          </span>
                        </div>
                      </td>

                      <td>
                        {ROLE_LABELS[user.role] || user.role || "—"}
                      </td>

                      <td>{formatDate(user.created_at)}</td>

                      <td>
                        <StatusBadge
                          status={user.account_status || user.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={
                loading
                  ? "Loading registrations…"
                  : "Recent registrations will appear when the dashboard API returns registration records."
              }
            />
          )}
        </article>

        <article className="admin-panel admin-urgent-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Urgent requests</h2>
              <p>Blood requests requiring attention</p>
            </div>

            <span className="admin-urgent-indicator">
              <span />
              Priority
            </span>
          </div>

          {urgentRequests.length > 0 ? (
            <div className="admin-urgent-list">
              {urgentRequests.slice(0, 4).map((request, index) => (
                <div
                  className="admin-urgent-item"
                  key={request.id || request.request_id || index}
                >
                  <span className="admin-urgent-drop" aria-hidden="true">
                    +
                  </span>

                  <div className="admin-urgent-details">
                    <strong>
                      {request.hospital_name ||
                        request.hospital?.name ||
                        request.hospital ||
                        "Hospital request"}
                    </strong>

                    <p>
                      {request.blood_group ||
                        request.blood_type ||
                        "Blood group unavailable"}
                      <span className="admin-inline-separator">·</span>
                      {request.city ||
                        request.location ||
                        "Location unavailable"}
                    </p>

                    <span className="admin-urgent-time">
                      {request.created_at
                        ? formatDate(request.created_at)
                        : request.request_id || "Blood request"}
                    </span>
                  </div>

                  <UrgencyBadge
                    urgency={request.urgency || request.priority}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              message={
                loading
                  ? "Loading urgent requests…"
                  : "Urgent requests will appear here when the dashboard API provides them."
              }
            />
          )}
        </article>
      </section>
    </main>
  );
}
