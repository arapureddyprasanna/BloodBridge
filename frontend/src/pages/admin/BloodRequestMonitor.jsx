import { API_BASE_URL } from "../../api";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import "./BloodRequestMonitor.css";

const API_URL = `${API_BASE_URL}/superadmin/blood-requests/`;

const EMPTY_STATS = {
    total: 0,
    open: 0,
    matching: 0,
    urgent: 0,
    fulfilled: 0,
};

const FILTERS = [
    { label: "All requests", value: "" },
    { label: "Active", value: "active" },
    { label: "Fulfilled", value: "fulfilled" },
    { label: "Closed", value: "closed" },
];

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getRequestCode(id) {
    return id ? `BR-${String(id).replaceAll("-", "").slice(0, 8).toUpperCase()}` : "—";
}

function getUrgencyLabel(urgency) {
    if (urgency === "critical") return "Critical";
    if (urgency === "urgent") return "High";
    return "Normal";
}

function getStatusLabel(status) {
    const labels = {
        open: "Open",
        matching: "Matching",
        partially_fulfilled: "Partially fulfilled",
        fulfilled: "Fulfilled",
        cancelled: "Cancelled",
        expired: "Expired",
    };

    return labels[status] || status || "Unknown";
}

export default function BloodRequestMonitor() {
    const [requests, setRequests] = useState([]);
    const [stats, setStats] = useState(EMPTY_STATS);
    const [pagination, setPagination] = useState({
        page: 1,
        page_size: 10,
        total_items: 0,
        total_pages: 1,
        has_next: false,
        has_previous: false,
    });

    const [search, setSearch] = useState("");
    const [bloodGroup, setBloodGroup] = useState("");
    const [urgency, setUrgency] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [activeTab, setActiveTab] = useState("");
    const [selectedRequest, setSelectedRequest] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const loadRequests = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const currentUser = auth.currentUser;

            if (!currentUser) {
                throw new Error("Your session has expired. Please sign in again.");
            }

            const token = await currentUser.getIdToken();

            const params = new URLSearchParams({
                page: String(pagination.page),
                page_size: String(pagination.page_size),
            });

            if (search.trim()) params.set("search", search.trim());
            if (bloodGroup) params.set("blood_group", bloodGroup);
            if (urgency) params.set("urgency", urgency);

            const effectiveStatus =
                activeTab === "fulfilled"
                    ? "fulfilled"
                    : activeTab === "closed"
                        ? "cancelled"
                        : activeTab === "active"
                            ? "open"
                            : statusFilter;

            if (effectiveStatus) params.set("status", effectiveStatus);

            const response = await fetch(`${API_URL}?${params.toString()}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    `Could not load blood requests (HTTP ${response.status}).`
                );
            }

            setRequests(Array.isArray(data.results) ? data.results : []);
            setStats({ ...EMPTY_STATS, ...(data.stats || {}) });
            setPagination((previous) => ({
                ...previous,
                ...(data.pagination || {}),
            }));

            setSelectedRequest((previous) => {
                if (!previous) return null;
                return data.results?.find((item) => item.id === previous.id) || null;
            });
        } catch (err) {
            setError(err.message || "Something went wrong while loading requests.");
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [
        pagination.page,
        pagination.page_size,
        search,
        bloodGroup,
        urgency,
        statusFilter,
        activeTab,
    ]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            loadRequests();
        }, search ? 300 : 0);

        return () => clearTimeout(timeout);
    }, [loadRequests, search, refreshKey]);

    const criticalCount = stats.urgent;
    const activeCount = stats.open + stats.matching;

    const metrics = useMemo(
        () => [
            {
                label: "Active requests",
                value: activeCount,
                note: "Open and matching",
                icon: "↗",
                style: "active",
            },
            {
                label: "Urgent requests",
                value: criticalCount,
                note: "Urgent and critical",
                icon: "!",
                style: "critical",
            },
            {
                label: "Fulfilled requests",
                value: stats.fulfilled,
                note: "All-time total",
                icon: "✓",
                style: "fulfilled",
            },
            {
                label: "Total requests",
                value: stats.total,
                note: "Across the platform",
                icon: "♡",
                style: "total",
            },
        ],
        [activeCount, criticalCount, stats.fulfilled, stats.total]
    );

    function changeTab(value) {
        setActiveTab(value);
        setStatusFilter("");
        setPagination((previous) => ({ ...previous, page: 1 }));
    }

    function resetFilters() {
        setSearch("");
        setBloodGroup("");
        setUrgency("");
        setStatusFilter("");
        setActiveTab("");
        setPagination((previous) => ({ ...previous, page: 1 }));
    }

    function changeFilter(setter, value) {
        setter(value);
        setPagination((previous) => ({ ...previous, page: 1 }));
    }

    return (
        <section className="brm-page">
            <div className="brm-page-heading">
                <div>
                    <span className="brm-eyebrow">PLATFORM OPERATIONS</span>
                    <h1>Blood Request Monitoring</h1>
                    <p>
                        Monitor hospital blood requests, urgency levels and fulfilment
                        across the BloodBridge network.
                    </p>
                </div>

                <button
                    className="brm-button brm-button-primary"
                    type="button"
                    onClick={() => setRefreshKey((value) => value + 1)}
                    disabled={loading}
                >
                    <span aria-hidden="true">↻</span>
                    {loading ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            <div className="brm-metrics">
                {metrics.map((metric) => (
                    <article className="brm-metric-card" key={metric.label}>
                        <div className="brm-metric-top">
                            <span>{metric.label}</span>
                            <span className={`brm-metric-icon ${metric.style}`}>
                                {metric.icon}
                            </span>
                        </div>
                        <strong>{metric.value.toLocaleString("en-IN")}</strong>
                        <small>{metric.note}</small>
                    </article>
                ))}
            </div>

            {criticalCount > 0 && (
                <div className="brm-alert" role="status">
                    <span className="brm-alert-icon">!</span>
                    <div>
                        <strong>{criticalCount} urgent requests need attention</strong>
                        <p>
                            Review urgent and critical requests and follow up on outstanding
                            needs.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            changeFilter(setUrgency, "critical");
                            changeTab("");
                        }}
                    >
                        View critical
                    </button>
                </div>
            )}

            <div className="brm-toolbar">
                    <label className="brm-search">
                        <span aria-hidden="true">⌕</span>
                        <input
                            type="search"
                            placeholder="Search hospital or request ID..."
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPagination((previous) => ({ ...previous, page: 1 }));
                            }}
                        />
                    </label>

                    <select
                        aria-label="Filter by blood group"
                        value={bloodGroup}
                        onChange={(event) =>
                            changeFilter(setBloodGroup, event.target.value)
                        }
                    >
                        <option value="">All blood groups</option>
                        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                            (group) => (
                                <option key={group} value={group}>
                                    {group}
                                </option>
                            )
                        )}
                    </select>

                    <select
                        aria-label="Filter by urgency"
                        value={urgency}
                        onChange={(event) => changeFilter(setUrgency, event.target.value)}
                    >
                        <option value="">All urgency levels</option>
                        <option value="critical">Critical</option>
                        <option value="urgent">High</option>
                        <option value="normal">Normal</option>
                    </select>

                    <select
                        aria-label="Filter by status"
                        value={statusFilter}
                        onChange={(event) => {
                            setActiveTab("");
                            changeFilter(setStatusFilter, event.target.value);
                        }}
                    >
                        <option value="">All statuses</option>
                        <option value="open">Open</option>
                        <option value="matching">Matching</option>
                        <option value="partially_fulfilled">Partially fulfilled</option>
                        <option value="fulfilled">Fulfilled</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                    </select>

                    <button
                        className="brm-button brm-button-outline"
                        type="button"
                        onClick={resetFilters}
                    >
                        Reset
                    </button>
                </div>


            <div className="brm-table-card">
                <div className="brm-table-heading">
                    <div>
                        <h2>Blood requests</h2>
                        <p>Review requests submitted by hospitals.</p>
                    </div>
                    <span className="brm-total-badge">
                        {pagination.total_items.toLocaleString("en-IN")} records
                    </span>
                </div>

                <div className="brm-tabs" role="tablist" aria-label="Request status">
                    {FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === filter.value}
                            className={activeTab === filter.value ? "active" : ""}
                            onClick={() => changeTab(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>

                
                {error && (
                    <div className="brm-error" role="alert">
                        <div>
                            <strong>Unable to load requests</strong>
                            <p>{error}</p>
                        </div>
                        <button
                            className="brm-button brm-button-outline"
                            type="button"
                            onClick={() => setRefreshKey((value) => value + 1)}
                        >
                            Try again
                        </button>
                    </div>
                )}

                <div className="brm-table-scroll">
                    <table className="brm-table">
                        <thead>
                            <tr>
                                <th>Request</th>
                                <th>Hospital</th>
                                <th>Blood group</th>
                                <th>Urgency</th>
                                <th>Units</th>
                                <th>Required by</th>
                                <th>Status</th>
                                <th aria-label="Actions" />
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td className="brm-state-cell" colSpan={8}>
                                        <span className="brm-spinner" />
                                        Loading blood requests...
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td className="brm-state-cell" colSpan={8}>
                                        Request data is unavailable. Use Try again to reload.
                                    </td>
                                </tr>
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td className="brm-state-cell" colSpan={8}>
                                        <span className="brm-empty-icon">♡</span>
                                        <strong>No blood requests found</strong>
                                        <p>Try changing your search or filters.</p>
                                    </td>
                                </tr>
                            ) : (
                                requests.map((request) => (
                                    <tr
                                        key={request.id}
                                        className={
                                            selectedRequest?.id === request.id ? "selected" : ""
                                        }
                                        onClick={() => setSelectedRequest(request)}
                                    >
                                        <td>
                                            <button
                                                className="brm-request-link"
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelectedRequest(request);
                                                }}
                                            >
                                                {getRequestCode(request.id)}
                                            </button>
                                            <span className="brm-subcell">
                                                Created {formatDate(request.created_at)}
                                            </span>
                                        </td>
                                        <td>
                                            <strong className="brm-hospital-name">
                                                {request.hospital_name || "Hospital"}
                                            </strong>
                                            <span className="brm-subcell">
                                                {request.hospital_email || "—"}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="brm-blood-group">
                                                {request.blood_group}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className={`brm-badge urgency-${request.urgency}`}
                                            >
                                                <span className="brm-badge-dot" />
                                                {getUrgencyLabel(request.urgency)}
                                            </span>
                                        </td>
                                        <td>{request.units_required}</td>
                                        <td>{formatDate(request.required_by)}</td>
                                        <td>
                                            <span className={`brm-badge status-${request.status}`}>
                                                {getStatusLabel(request.status)}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="brm-row-action"
                                                type="button"
                                                aria-label={`View ${getRequestCode(request.id)} details`}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelectedRequest(request);
                                                }}
                                            >
                                                →
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="brm-pagination">
                    <span>
                        Showing {requests.length ? (pagination.page - 1) * pagination.page_size + 1 : 0}
                        {"–"}
                        {(pagination.page - 1) * pagination.page_size + requests.length}
                        {" of "}
                        {pagination.total_items}
                    </span>

                    <div>
                        <button
                            type="button"
                            disabled={loading || !pagination.has_previous}
                            onClick={() =>
                                setPagination((previous) => ({
                                    ...previous,
                                    page: previous.page - 1,
                                }))
                            }
                        >
                            ← Previous
                        </button>
                        <span>
                            Page {pagination.page} of {Math.max(1, pagination.total_pages)}
                        </span>
                        <button
                            type="button"
                            disabled={loading || !pagination.has_next}
                            onClick={() =>
                                setPagination((previous) => ({
                                    ...previous,
                                    page: previous.page + 1,
                                }))
                            }
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </div>

            {selectedRequest && (
                <div
                    className="brm-drawer-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setSelectedRequest(null);
                        }
                    }}
                >
                    <aside
                        className="brm-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="brm-drawer-title"
                    >
                        <div className="brm-drawer-header">
                            <div>
                                <span className="brm-eyebrow">REQUEST DETAILS</span>
                                <h2 id="brm-drawer-title">
                                    {getRequestCode(selectedRequest.id)}
                                </h2>
                            </div>
                            <button
                                type="button"
                                className="brm-drawer-close"
                                aria-label="Close request details"
                                onClick={() => setSelectedRequest(null)}
                            >
                                ×
                            </button>
                        </div>

                        <div className="brm-drawer-content">
                            <div className="brm-drawer-status">
                                <span className={`brm-badge urgency-${selectedRequest.urgency}`}>
                                    {getUrgencyLabel(selectedRequest.urgency)} priority
                                </span>
                                <span className={`brm-badge status-${selectedRequest.status}`}>
                                    {getStatusLabel(selectedRequest.status)}
                                </span>
                            </div>

                            <div className="brm-detail-blood">
                                <span>Requested blood group</span>
                                <strong>{selectedRequest.blood_group}</strong>
                                <p>{selectedRequest.units_required} units requested</p>
                            </div>

                            <section className="brm-detail-section">
                                <h3>Hospital information</h3>
                                <div className="brm-detail-row">
                                    <span>Hospital</span>
                                    <strong>{selectedRequest.hospital_name || "—"}</strong>
                                </div>
                                <div className="brm-detail-row">
                                    <span>Email</span>
                                    <strong>{selectedRequest.hospital_email || "—"}</strong>
                                </div>
                            </section>

                            <section className="brm-detail-section">
                                <h3>Timeline</h3>
                                <div className="brm-detail-row">
                                    <span>Created</span>
                                    <strong>{formatDate(selectedRequest.created_at)}</strong>
                                </div>
                                <div className="brm-detail-row">
                                    <span>Required by</span>
                                    <strong>{formatDate(selectedRequest.required_by)}</strong>
                                </div>
                                <div className="brm-detail-row">
                                    <span>Last updated</span>
                                    <strong>{formatDate(selectedRequest.updated_at)}</strong>
                                </div>
                            </section>

                            {selectedRequest.hospital_notes && (
                                <section className="brm-detail-section">
                                    <h3>Hospital notes</h3>
                                    <p className="brm-hospital-notes">
                                        {selectedRequest.hospital_notes}
                                    </p>
                                </section>
                            )}
                        </div>

                        <div className="brm-drawer-footer">
                            <button
                                className="brm-button brm-button-outline"
                                type="button"
                                onClick={() => setSelectedRequest(null)}
                            >
                                Close
                            </button>
                        </div>
                    </aside>
                </div>
            )}
        </section>
    );
}
