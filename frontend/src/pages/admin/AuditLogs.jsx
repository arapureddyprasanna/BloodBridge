import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import "./AuditLogs.css";

const PAGE_SIZE = 10;

function getEvents(data) {
  if (Array.isArray(data)) return data;
  return data.results || data.events || data.logs || [];
}

function getEventId(event, index = 0) {
  return String(event.id ?? event.uuid ?? event.event_id ?? index);
}

function getActor(event) {
  if (event.actor_name) return event.actor_name;
  if (event.actor?.full_name) return event.actor.full_name;
  if (event.actor?.name) return event.actor.name;
  if (event.actor_email) return event.actor_email;
  if (event.actor?.email) return event.actor.email;
  return event.actor_type === "system" || event.actor === "system"
    ? "System"
    : "Unknown actor";
}

function getEmail(event) {
  return event.actor_email || event.actor?.email || "";
}

function getAction(event) {
  return String(event.action || event.action_type || event.event_type || "Activity")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getOutcome(event) {
  const value = String(
    event.outcome || event.status || event.result || "success"
  ).toLowerCase();

  return ["blocked", "denied", "failed", "failure", "rejected", "error"].some(
    (word) => value.includes(word)
  )
    ? "blocked"
    : "success";
}

function getDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function getInitials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function getError(data, fallback) {
  return data.detail || data.message || data.error || fallback;
}

function MetricCard({ icon, label, value, note, accent }) {
  return (
    <article className={`al-metric-card ${accent || ""}`}>
      <div className="al-metric-top">
        <span>{label}</span>
        <span className="al-metric-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function OutcomeBadge({ event }) {
  const blocked = getOutcome(event) === "blocked";

  return (
    <span className={`al-outcome-badge ${blocked ? "is-blocked" : "is-success"}`}>
      <span />
      {blocked ? "Blocked" : "Success"}
    </span>
  );
}

function Detail({ label, value, full = false }) {
  return (
    <div className={full ? "al-detail-full" : ""}>
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === "" ? "Not recorded" : String(value)}</strong>
    </div>
  );
}

export default function AuditLogs() {
  const [events, setEvents] = useState([]);
  const [overview, setOverview] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");

      const token = await user.getIdToken(true);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });

      if (search.trim()) params.set("search", search.trim());
      if (actorFilter !== "all") params.set("actor", actorFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetch(
        `${API_BASE_URL}/superadmin/audit-logs/?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(getError(data, "Unable to load audit logs."));
      }

      const items = getEvents(data);
      setEvents(items);
      setTotal(Number(data.count ?? data.total ?? items.length));

      setSelectedId((current) => {
        if (current && items.some((event, index) => getEventId(event, index) === current)) {
          return current;
        }
        return items.length ? getEventId(items[0], 0) : null;
      });
    } catch (err) {
      setError(err.message || "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [page, search, actorFilter, actionFilter, outcomeFilter, startDate, endDate]);

  const loadOverview = useCallback(async () => {
  try {
    const user = auth.currentUser;

    if (!user) {
      console.error("Audit overview: Firebase user is missing.");
      return;
    }

    const token = await user.getIdToken(true);

    const response = await fetch(
      `${API_BASE_URL}/superadmin/audit-logs/overview/`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        "Audit overview failed:",
        response.status,
        data
      );
      return;
    }

    setOverview(data);
  } catch (error) {
    console.error("Audit overview request failed:", error);
  }
}, []);
    
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const selectedEvent = useMemo(
    () =>
      events.find((event, index) => getEventId(event, index) === selectedId) ||
      null,
    [events, selectedId]
  );

  const actionOptions = useMemo(
    () => [...new Set(events.map((event) => getAction(event)))].sort(),
    [events]
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setSearch("");
    setActorFilter("all");
    setActionFilter("all");
    setOutcomeFilter("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const refresh = async () => {
    await Promise.all([loadLogs(), loadOverview()]);
    showToast("Audit logs refreshed.", "success");
  };

  const actorName = selectedEvent ? getActor(selectedEvent) : "";

  const target =
    selectedEvent?.target_type ||
    selectedEvent?.entity_type ||
    selectedEvent?.resource_type ||
    "Not recorded";

  const targetId =
    selectedEvent?.target_id ||
    selectedEvent?.entity_id ||
    selectedEvent?.resource_id ||
    "Not recorded";

  const metadata =
    selectedEvent?.metadata ??
    selectedEvent?.details ??
    selectedEvent?.changes ??
    null;

  return (
    <section className="al-page">
      <header className="al-page-heading">
        <div>
          <div className="al-breadcrumb">
            <span>Administration</span>
            <span>/</span>
            <span>Audit Logs</span>
          </div>
          <h1>Audit Logs</h1>
          <p>Monitor administrative activity, security events, and system changes.</p>
        </div>

        <button
          className="al-refresh-button"
          type="button"
          onClick={refresh}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="al-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadLogs}>Try again</button>
        </div>
      )}

      <div className="al-metrics">
        <MetricCard
          icon="◷"
          label="Events today"
          value={overview.events_today ?? "—"}
          note="Recorded since midnight"
          accent="al-metric-primary"
        />
        <MetricCard
          icon="♙"
          label="Active administrators"
          value={overview.active_administrators ?? "—"}
          note="Distinct actors in the last 7 days"
        />
        <MetricCard
          icon="!"
          label="Blocked events"
          value={overview.blocked_events ?? "—"}
          note="Security events recorded"
          accent="al-metric-danger"
        />
        <MetricCard
          icon="▤"
          label="Log retention"
          value={
            overview.log_retention_days != null
              ? `${overview.log_retention_days} days`
              : "—"
          }
          note="Audit history retention policy"
        />
      </div>

      <div className="al-filter-bar">
        <label className="al-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search activity, user, IP address..."
            aria-label="Search audit logs"
          />
        </label>

        <div className="al-filter-row">
          <label className="al-select-wrap">
            <span className="al-sr-only">Actor filter</span>
            <select
              value={actorFilter}
              onChange={(event) => {
                setActorFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All actors</option>
              <option value="system">System events</option>
            </select>
          </label>

          <label className="al-select-wrap">
            <span className="al-sr-only">Outcome filter</span>
            <select
              value={outcomeFilter}
              onChange={(event) => {
                setOutcomeFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All outcomes</option>
              <option value="success">Success</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>

          <button
            type="button"
            className={`al-filter-button ${showFilters ? "is-active" : ""}`}
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            ☷ Filters
          </button>
        </div>

        {showFilters && (
          <div className="al-extra-filters">
            <label>
              <span>Action</span>
              <select
                value={actionFilter}
                onChange={(event) => {
                  setActionFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All actions</option>
                {actionOptions.map((action) => (
                  <option value={action} key={action}>{action}</option>
                ))}
              </select>
            </label>
            <label>
              <span>From date</span>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              <span>To date</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button type="button" onClick={resetFilters}>Reset filters</button>
          </div>
        )}
      </div>

      <div className="al-workspace">
        <section className="al-table-panel">
          <div className="al-panel-heading">
            <div>
              <h2>Activity history</h2>
              <p>Review and inspect recorded system events.</p>
            </div>
            <span className="al-total-count">{total}</span>
          </div>

          <div className="al-table-scroll">
            <table className="al-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Outcome</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="al-table-state">
                    <span className="al-spinner" />
                    Loading audit events…
                  </td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan="6" className="al-table-state">
                    {error ? "Unable to load events. Try refreshing." : "No audit events found for these filters."}
                  </td></tr>
                ) : (
                  events.map((event, index) => {
                    const id = getEventId(event, index);
                    const selected = id === selectedId;

                    return (
                      <tr
                        key={id}
                        className={selected ? "is-selected" : ""}
                        tabIndex={0}
                        aria-selected={selected}
                        onClick={() => setSelectedId(id)}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                            keyEvent.preventDefault();
                            setSelectedId(id);
                          }
                        }}
                      >
                        <td className="al-timestamp">{getDate(
                          event.created_at || event.timestamp || event.occurred_at
                        )}</td>
                        <td>
                          <div className="al-actor-cell">
                            <span className="al-avatar">{getInitials(getActor(event)) || "?"}</span>
                            <span>
                              <strong>{getActor(event)}</strong>
                              <small>{getEmail(event) || event.actor_type || "Activity actor"}</small>
                            </span>
                          </div>
                        </td>
                        <td><span className="al-action-label">{getAction(event)}</span></td>
                        <td>
                          <div className="al-target-cell">
                            <strong>{event.target_type || event.entity_type || event.resource_type || "System"}</strong>
                            <small>{event.target_id || event.entity_id || event.resource_id || "—"}</small>
                          </div>
                        </td>
                        <td><OutcomeBadge event={event} /></td>
                        <td className="al-ip">{event.ip_address || event.ip || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="al-pagination">
            <span>
              {total === 0
                ? "No events"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} events`}
            </span>
            <div>
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span>Page {page} of {pageCount}</span>
              <button
                type="button"
                disabled={loading || page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <aside className="al-inspector-panel" aria-label="Audit event details">
          {!selectedEvent ? (
            <div className="al-inspector-empty">
              <span className="al-empty-icon">▤</span>
              <h2>Select an event</h2>
              <p>Choose an audit event from the table to inspect its details.</p>
            </div>
          ) : (
            <>
              <div className="al-inspector-header">
                <div>
                  <span className="al-section-eyebrow">EVENT DETAILS</span>
                  <h2>{getAction(selectedEvent)}</h2>
                  <p>{getDate(selectedEvent.created_at || selectedEvent.timestamp || selectedEvent.occurred_at)}</p>
                </div>
                <OutcomeBadge event={selectedEvent} />
              </div>

              <div className="al-detail-section">
                <h3>Activity information</h3>
                <div className="al-detail-grid">
                  <Detail label="Actor" value={actorName} />
                  <Detail label="Actor email" value={getEmail(selectedEvent)} />
                  <Detail label="Action" value={getAction(selectedEvent)} />
                  <Detail label="Outcome" value={getOutcome(selectedEvent) === "blocked" ? "Blocked" : "Success"} />
                  <Detail label="Target type" value={target} />
                  <Detail label="Target ID" value={targetId} />
                  <Detail label="IP address" value={selectedEvent.ip_address || selectedEvent.ip} />
                  <Detail label="Event ID" value={selectedEvent.id || selectedEvent.uuid || selectedEvent.event_id} />
                  <Detail label="Description" value={selectedEvent.description} full />
                  <Detail label="Reason" value={selectedEvent.reason} full />
                  <Detail label="User agent" value={selectedEvent.user_agent} full />
                </div>
              </div>

              {metadata != null && (
                <div className="al-detail-section">
                  <h3>Additional details</h3>
                  <pre>{typeof metadata === "string" ? metadata : JSON.stringify(metadata, null, 2)}</pre>
                </div>
              )}

              <div className="al-review-note">
                <span aria-hidden="true">ⓘ</span>
                <p>Audit records are intended for traceability and security review. Inspect event details before drawing conclusions.</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
