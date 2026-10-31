import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { auth } from "../../firebase";
import "./ReportsAnalytics.css";

const API_URL = `${API_BASE_URL}/superadmin/reports/analytics/`;

const COLORS = ["#7A1F2B", "#B97878", "#D9A5A5", "#E8C9C7", "#9B7373", "#756868"];

const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");

const formatLabel = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);

  const toDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return { start: toDateInput(start), end: toDateInput(end) };
};

const EMPTY_REPORT = {
  total_users: 0,
  active_users: 0,
  total_donors: 0,
  total_hospitals: 0,
  total_communities: 0,
  total_requests: 0,
  active_requests: 0,
  fulfilled_requests: 0,
  cancelled_requests: 0,
  fulfillment_rate: 0,
  blood_group_distribution: [],
  urgency_distribution: [],
  status_distribution: [],
  monthly_requests: [],
};

function MetricCard({ label, value, note, icon, variant }) {
  return (
    <article className={`ra-metric-card ra-metric-${variant}`}>
      <div className="ra-metric-top">
        <span className="ra-metric-label">{label}</span>
        <span className="ra-metric-icon" aria-hidden="true">{icon}</span>
      </div>
      <strong className="ra-metric-value">{value}</strong>
      <span className="ra-metric-note">{note}</span>
    </article>
  );
}

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <section className={`ra-chart-card ${className}`}>
      <div className="ra-chart-heading">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ message = "No data available for this period." }) {
  return <div className="ra-chart-empty">{message}</div>;
}

export default function ReportsAnalytics() {
  const initialDates = useMemo(() => getDefaultDates(), []);
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [appliedDates, setAppliedDates] = useState(initialDates);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const token = await currentUser.getIdToken();
      const params = new URLSearchParams({
        start_date: appliedDates.start,
        end_date: appliedDates.end,
      });

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Unable to load reports (HTTP ${response.status}).`
        );
      }

      setReport({ ...EMPTY_REPORT, ...data });
    } catch (err) {
      setError(err.message || "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [appliedDates]);

  useEffect(() => {
    loadReport();
  }, [loadReport, refreshKey]);

  const metrics = [
    {
      label: "Total users",
      value: formatNumber(report.total_users),
      note: `${formatNumber(report.active_users)} active accounts`,
      icon: "♙",
      variant: "users",
    },
    {
      label: "Registered donors",
      value: formatNumber(report.total_donors),
      note: "Across all communities",
      icon: "♥",
      variant: "donors",
    },
    {
      label: "Hospitals",
      value: formatNumber(report.total_hospitals),
      note: `${formatNumber(report.total_communities)} communities`,
      icon: "✚",
      variant: "hospitals",
    },
    {
      label: "Blood requests",
      value: formatNumber(report.total_requests),
      note: `${formatNumber(report.active_requests)} currently active`,
      icon: "↗",
      variant: "requests",
    },
    {
      label: "Fulfilled requests",
      value: formatNumber(report.fulfilled_requests),
      note: `${formatNumber(report.fulfillment_rate)}% fulfillment rate`,
      icon: "✓",
      variant: "fulfilled",
    },
    {
      label: "Closed requests",
      value: formatNumber(report.cancelled_requests),
      note: "Cancelled or expired",
      icon: "—",
      variant: "closed",
    },
  ];

  const bloodGroupData = report.blood_group_distribution.map((item) => ({
    name: item.blood_group,
    requests: item.count,
    units: item.units || 0,
  }));

  const urgencyData = report.urgency_distribution.map((item) => ({
    name: formatLabel(item.urgency),
    value: item.count,
  }));

  const statusData = report.status_distribution.map((item) => ({
    name: formatLabel(item.status),
    value: item.count,
  }));

  const monthlyData = report.monthly_requests.map((item) => {
    const [year, month] = item.month.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);

    return {
      month: date.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      }),
      requests: item.count,
    };
  });

  const applyDateFilter = (event) => {
    event.preventDefault();

    if (!startDate || !endDate) {
      setError("Please select both dates.");
      return;
    }

    if (startDate > endDate) {
      setError("Start date cannot be after end date.");
      return;
    }

    setAppliedDates({ start: startDate, end: endDate });
  };

  const exportReport = () => {
    const rows = [
      ["BloodBridge Reports & Analytics"],
      ["Period", `${appliedDates.start} to ${appliedDates.end}`],
      [],
      ["Metric", "Value"],
      ["Total users", report.total_users],
      ["Active users", report.active_users],
      ["Registered donors", report.total_donors],
      ["Hospitals", report.total_hospitals],
      ["Communities", report.total_communities],
      ["Blood requests", report.total_requests],
      ["Active requests", report.active_requests],
      ["Fulfilled requests", report.fulfilled_requests],
      ["Cancelled or expired requests", report.cancelled_requests],
      ["Fulfillment rate (%)", report.fulfillment_rate],
      [],
      ["Blood group", "Request count", "Units required"],
      ...bloodGroupData.map((item) => [item.name, item.requests, item.units]),
      [],
      ["Urgency", "Request count"],
      ...urgencyData.map((item) => [item.name, item.value]),
      [],
      ["Status", "Request count"],
      ...statusData.map((item) => [item.name, item.value]),
      [],
      ["Month", "Requests"],
      ...monthlyData.map((item) => [item.month, item.requests]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `bloodbridge-report-${appliedDates.start}-to-${appliedDates.end}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="ra-page">
      <header className="ra-page-header">
        <div>
          <span className="ra-eyebrow">SUPER ADMINISTRATION</span>
          <h1>Reports &amp; Analytics</h1>
          <p>Monitor blood demand, platform activity, and fulfillment performance.</p>
        </div>

        <button
          type="button"
          className="ra-export-button"
          onClick={exportReport}
          disabled={loading || Boolean(error)}
        >
          <span aria-hidden="true">↓</span> Export CSV
        </button>
      </header>

      <form className="ra-filter-bar" onSubmit={applyDateFilter}>
        <div className="ra-filter-title">
          <span className="ra-filter-icon" aria-hidden="true">▦</span>
          <div>
            <strong>Reporting period</strong>
            <span>Choose a date range</span>
          </div>
        </div>

        <label className="ra-date-field">
          <span>From</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </label>

        <label className="ra-date-field">
          <span>To</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            max={initialDates.end}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </label>

        <button type="submit" className="ra-apply-button" disabled={loading}>
          Apply filters
        </button>

        <button
          type="button"
          className="ra-refresh-button"
          onClick={() => setRefreshKey((value) => value + 1)}
          aria-label="Refresh reports"
          title="Refresh reports"
          disabled={loading}
        >
          ↻
        </button>
      </form>

      {error && (
        <div className="ra-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="ra-loading" role="status">
          <span className="ra-spinner" />
          Loading analytics…
        </div>
      )}

      {!error && (
        <>
          <section className="ra-metrics-grid" aria-label="Platform overview">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </section>

          <section className="ra-chart-grid">
            <ChartCard
              title="Blood group demand"
              subtitle="Requests and required units by blood type"
              className="ra-chart-wide"
            >
              {bloodGroupData.length ? (
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart data={bloodGroupData} margin={{ top: 12, right: 12, left: -15, bottom: 4 }}>
                    <CartesianGrid stroke="#EFE4E0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="requests" name="Requests" fill="#7A1F2B" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="units" name="Units required" fill="#D9A5A5" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard
              title="Request urgency"
              subtitle="Distribution by urgency level"
            >
              {urgencyData.length ? (
                <ResponsiveContainer width="100%" height={290}>
                  <PieChart>
                    <Pie
                      data={urgencyData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      innerRadius={58}
                      outerRadius={94}
                      paddingAngle={3}
                    >
                      {urgencyData.map((item, index) => (
                        <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard
              title="Monthly request trends"
              subtitle="Requests created each month in the selected period"
              className="ra-chart-wide"
            >
              {monthlyData.length ? (
                <ResponsiveContainer width="100%" height={290}>
                  <LineChart data={monthlyData} margin={{ top: 12, right: 16, left: -15, bottom: 4 }}>
                    <CartesianGrid stroke="#EFE4E0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="requests"
                      name="Requests"
                      stroke="#7A1F2B"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#7A1F2B" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard
              title="Request status"
              subtitle="Current status of requests created in this period"
            >
              {statusData.length ? (
                <div className="ra-status-list">
                  {statusData.map((item, index) => {
                    const total = statusData.reduce((sum, entry) => sum + entry.value, 0);
                    const percentage = total ? (item.value / total) * 100 : 0;

                    return (
                      <div className="ra-status-item" key={item.name}>
                        <div className="ra-status-label">
                          <span>
                            <i style={{ background: COLORS[index % COLORS.length] }} />
                            {item.name}
                          </span>
                          <strong>{formatNumber(item.value)}</strong>
                        </div>
                        <div className="ra-status-track">
                          <span
                            style={{
                              width: `${percentage}%`,
                              background: COLORS[index % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyChart />}
            </ChartCard>
          </section>

          <footer className="ra-page-footer">
            <span>Reports reflect database records for the selected creation-date range.</span>
            <span>{appliedDates.start} — {appliedDates.end}</span>
          </footer>
        </>
      )}
    </main>
  );
}
