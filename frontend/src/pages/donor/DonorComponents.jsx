import { Link } from "react-router-dom";

export function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StatusBadge({ status }) {
  const normalized = String(status || "awaiting")
    .toLowerCase()
    .replace(/[_-]/g, " ");

  const variants = {
    awaiting: "neutral",
    pending: "neutral",
    accepted: "success",
    declined: "danger",
    "in coordination": "info",
    active: "success",
    available: "success",
    paused: "warning",
    open: "success",
    published: "success",
    scheduled: "info",
    matching: "info",
    "partially fulfilled": "warning",
    normal: "neutral",
    draft: "warning",
    closed: "neutral",
    archived: "neutral",
    cancelled: "danger",
    expired: "neutral",
    unavailable: "neutral",
    private: "neutral",
    urgent: "warning",
    critical: "danger",
  };

  const labels = {
    awaiting: "Awaiting",
    pending: "Awaiting",
    accepted: "Accepted",
    declined: "Declined",
    "in coordination": "In coordination",
    active: "Active",
    available: "Available",
    paused: "Paused",
    open: "Open",
    published: "Published",
    scheduled: "Scheduled",
    matching: "Matching",
    "partially fulfilled": "Partially fulfilled",
    normal: "Normal",
    draft: "Draft",
    closed: "Closed",
    archived: "Archived",
    cancelled: "Cancelled",
    expired: "Expired",
    unavailable: "Unavailable",
    private: "Not shared",
    urgent: "Urgent",
    critical: "Critical",
  };

  const variant = variants[normalized] || "neutral";
  const label = labels[normalized] || status || "Awaiting";

  return (
    <span className={`bb-status-badge bb-status-badge--${variant}`}>
      {label}
    </span>
  );
}

export function StatCard({ label, value, meta, empty = false }) {
  return (
    <div className={`bb-stat-card ${empty ? "is-empty" : ""}`}>
      <p className="bb-stat-label">{label}</p>
      <h3 className="bb-stat-value">{value}</h3>
      {meta ? <p className="bb-stat-meta">{meta}</p> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, action, actionLabel }) {
  return (
    <div className="bb-page-header">
      <div>
        {eyebrow ? <p className="bb-page-eyebrow">{eyebrow}</p> : null}
        <h1 className="bb-page-title">{title}</h1>
        {subtitle ? <p className="bb-page-subtitle">{subtitle}</p> : null}
      </div>

      {action ? (
        <button type="button" className="bb-primary-button" onClick={action}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ message = "Loading donor workspace..." }) {
  return (
    <div className="bb-loading-state">
      <div className="bb-loading-spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon = "◌",
}) {
  return (
    <div className="bb-empty-state">
      <span className="bb-empty-state-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button type="button" className="bb-secondary-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function PrivacyNoticeBox({
  title = "Privacy notice",
  description,
}) {
  return (
    <div className="bb-privacy-box">
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  );
}

export function FilterBar({
  search,
  setSearch,
  activeFilter,
  setActiveFilter,
  filters,
  placeholder = "Search by hospital or request ID",
}) {
  return (
    <div className="bb-filter-bar">
      <div className="bb-search-field">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>

      {filters?.length ? (
        <div className="bb-pill-group" aria-label="Request status filters">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter}
              className={`bb-pill ${activeFilter === filter ? "is-active" : ""}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RequestCard({ request, onAccept, onDecline, busy = false }) {
  const normalizedStatus = String(request?.status || request?.invitation_status || "awaiting").toLowerCase();
  const requestId = request?.request_id || request?.id || request?.blood_request_id || "N/A";
  const hospital = request?.hospital_name || request?.hospital || "Hospital";
  const bloodGroup = request?.blood_group || request?.bloodGroup || "Blood group not set";
  const urgency = request?.urgency || request?.priority || "normal";
  const unitsNeeded = request?.units_needed ?? request?.units_required ?? request?.units ?? "—";
  const compatibility = request?.compatibility || request?.match_score || "Review required";
  const requiredBy = request?.required_by || request?.requiredDate || request?.required_at || null;
  const distance = request?.distance_km ?? request?.distance ?? null;
  const statusLabels = { pending: "Awaiting", accepted: "Accepted", declined: "Declined", expired: "Expired", cancelled: "Cancelled" };
  const statusLabel = statusLabels[normalizedStatus] || normalizedStatus.replaceAll("_", " ");
  const canRespond = normalizedStatus === "pending";

  return (
    <article className="bb-request-card">
      <header className="bb-request-card-header">
        <div>
          <p className="bb-request-card-label">Request #{String(requestId).slice(0, 8).toUpperCase()}</p>
          <h3>{hospital}</h3>
        </div>
        <StatusBadge status={statusLabel} />
      </header>

      <div className="bb-request-card-body">
        <div className="bb-request-metadata">
          <span>{bloodGroup}</span>
          <span>{urgency}</span>
          <span>{unitsNeeded} units needed</span>
        </div>

        <div className="bb-request-details-grid">
          <div>
            <small>Compatibility</small>
            <strong>{compatibility}</strong>
          </div>
          <div>
            <small>Required</small>
            <strong>{formatDateTime(requiredBy)}</strong>
          </div>
          <div>
            <small>Distance</small>
            <strong>{distance !== null ? `${distance} km` : "Location not shared"}</strong>
          </div>
        </div>
      </div>

      <div className="bb-request-card-actions">
        {canRespond && <>
          <button type="button" className="bb-secondary-button" disabled={busy} onClick={() => onDecline?.(request)}>
            {busy ? "Updating…" : "Decline"}
          </button>
          <button type="button" className="bb-primary-button" disabled={busy} onClick={() => onAccept?.(request)}>
            {busy ? "Updating…" : "Accept"}
          </button>
        </>}
        <Link className="bb-text-button" to={`/donor/requests/${requestId}`}>
          View Details
        </Link>
      </div>
    </article>
  );
}

export function DonationTable({ rows = [] }) {
  if (!rows.length) {
    return (
      <div className="bb-table-empty">No donation records are available yet.</div>
    );
  }

  return (
    <div className="bb-table-wrap">
      <table className="bb-data-table">
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Date</th>
            <th>Units</th>
            <th>Status</th>
            <th>Hospital</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || row.blood_request_id || row.request_id || row.date}>
              <td>{row.request_id || row.blood_request_id || "N/A"}</td>
              <td>{formatDate(row.date || row.donation_date)}</td>
              <td>{row.units || row.units_donated || 0}</td>
              <td>
                <StatusBadge status={row.status || "completed"} />
              </td>
              <td>{row.hospital || row.hospital_name || "Hospital"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CommunityCard({ title, value, subtitle }) {
  return (
    <div className="bb-stat-card">
      <p className="bb-stat-label">{title}</p>
      <strong className="bb-stat-value">{value}</strong>
      {subtitle ? <p className="bb-stat-meta">{subtitle}</p> : null}
    </div>
  );
}
