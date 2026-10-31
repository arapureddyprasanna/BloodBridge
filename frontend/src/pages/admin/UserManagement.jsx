import { API_BASE_URL } from "../../api";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { auth } from "../../firebase";
import "./UserManagement.css";
import "./HospitalVerification.css";

const API_URL = `${API_BASE_URL}/superadmin/users/`;

const ROLES = [
  { value: "", label: "All roles" },
  { value: "super_admin", label: "Super Admin" },
  { value: "hospital_admin", label: "Hospital Admin" },
  { value: "community_admin", label: "Community Admin" },
  { value: "donor", label: "Donor" },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

const EMPTY_STATS = {
  total_users: 0,
  active_users: 0,
  pending_users: 0,
  suspended_users: 0,
};

function getInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatRole(role = "") {
  return (
    {
      super_admin: "Super Admin",
      hospital_admin: "Hospital Admin",
      community_admin: "Community Admin",
      donor: "Donor",
    }[role] || role.replaceAll("_", " ")
  );
}

function formatStatus(status = "") {
  return status
    ? status.charAt(0).toUpperCase() + status.slice(1)
    : "Unknown";
}

async function getToken() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return currentUser.getIdToken();
}

async function readError(response) {
  try {
    const data = await response.json();

    return (
      data.detail ||
      data.message ||
      Object.values(data).flat().join(" ") ||
      "The request could not be completed."
    );
  } catch {
    return "The request could not be completed.";
  }
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [statistics, setStatistics] = useState(EMPTY_STATS);
  const [selectedUser, setSelectedUser] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [page, setPage] = useState(1);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const token = await getToken();

      const params = new URLSearchParams({
        page: String(page),
        page_size: "10",
      });

      if (search) params.set("search", search);
      if (role) params.set("role", role);
      if (accountStatus) params.set("status", accountStatus);

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();

      setUsers(data.results || []);
      setStatistics(data.statistics || EMPTY_STATS);
      setTotal(data.count || 0);
      setTotalPages(data.total_pages || 0);

      setSelectedUser((current) => {
        if (!data.results?.length) return null;

        return (
          data.results.find((user) => user.id === current?.id) ||
          data.results[0]
        );
      });
    } catch (error) {
      setLoadError(error.message || "Unable to load users.");
      setUsers([]);
      setSelectedUser(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, role, accountStatus]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setRole("");
    setAccountStatus("");
    setPage(1);
  };

  const exportUsers = async () => {
    setExportLoading(true);

    try {
      const token = await getToken();

      const params = new URLSearchParams({ export: "csv" });

      if (search) params.set("search", search);
      if (role) params.set("role", role);
      if (accountStatus) params.set("status", accountStatus);

      const response = await fetch(`${API_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = "bloodbridge-users.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(downloadUrl);

      toast.success("User export downloaded.");
    } catch (error) {
      toast.error(error.message || "Unable to export users.");
    } finally {
      setExportLoading(false);
    }
  };

  const updateAccountStatus = async () => {
    if (!confirmation || actionLoading) return;

    const { nextStatus, userId, userName } = confirmation;

    setActionLoading(true);

    try {
      const token = await getToken();

      const response = await fetch(`${API_URL}${userId}/status/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      toast.success(
        nextStatus === "suspended"
          ? `${userName}'s account suspended.`
          : `${userName}'s account reactivated.`
      );

      setConfirmation(null);
      await fetchUsers();
    } catch (error) {
      toast.error(error.message || "Unable to update the account.");
    } finally {
      setActionLoading(false);
    }
  };

  const openStatusConfirmation = () => {
    if (!selectedUser || actionLoading) return;

    if (selectedUser.role === "super_admin") {
      toast.error("Super Admin accounts cannot be changed here.");
      return;
    }

    if (selectedUser.status === "rejected") {
      toast.error("Rejected accounts cannot be changed here.");
      return;
    }

    setConfirmation({
      nextStatus:
        selectedUser.status === "suspended" ? "active" : "suspended",
      userId: selectedUser.id,
      userName: selectedUser.full_name || "this user",
    });
  };

  return (
    <section className="um-page">
      <div className="um-heading">
        <div>
          <p className="um-eyebrow">PLATFORM ADMINISTRATION</p>
          <h1>User Management</h1>
          <p className="um-subtitle">
            View user accounts and manage platform access.
          </p>
        </div>

        <button
          className="um-button um-button-outline"
          type="button"
          onClick={exportUsers}
          disabled={exportLoading || loading}
        >
          <span aria-hidden="true">⇩</span>
          {exportLoading ? "Exporting..." : "Export users"}
        </button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="um-filters">
        <label className="um-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search name, email or phone..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search users"
          />
        </label>

        <select
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by role"
        >
          {ROLES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={accountStatus}
          onChange={(event) => {
            setAccountStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by account status"
        >
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="um-reset-button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      {/* LIVE STATISTICS */}
      <div className="um-stats">
        <article className="um-stat-card">
          <div className="um-stat-top">
            <span>Total users</span>
            <span className="um-stat-icon">♙</span>
          </div>
          <strong>{statistics.total_users.toLocaleString("en-IN")}</strong>
          <small>Registered platform accounts</small>
        </article>

        <article className="um-stat-card">
          <div className="um-stat-top">
            <span>Active accounts</span>
            <span className="um-stat-icon um-icon-green">✓</span>
          </div>
          <strong>{statistics.active_users.toLocaleString("en-IN")}</strong>
          <small>Approved active accounts</small>
        </article>

        <article className="um-stat-card">
          <div className="um-stat-top">
            <span>Pending accounts</span>
            <span className="um-stat-icon um-icon-amber">◷</span>
          </div>
          <strong>{statistics.pending_users.toLocaleString("en-IN")}</strong>
          <small>Awaiting approval</small>
        </article>

        <article className="um-stat-card">
          <div className="um-stat-top">
            <span>Suspended accounts</span>
            <span className="um-stat-icon um-icon-red">⊘</span>
          </div>
          <strong>{statistics.suspended_users.toLocaleString("en-IN")}</strong>
          <small>Currently suspended</small>
        </article>
      </div>

      {/* USERS DIRECTORY */}
      <div className="um-workspace">
        <div className="um-directory">
          <div className="um-directory-heading">
            <div>
              <h2>All users</h2>
              <p>
                {total.toLocaleString("en-IN")} matching account
                {total === 1 ? "" : "s"}
              </p>
            </div>

            <span className="um-live-label">
              <span /> Live data
            </span>
          </div>

          {loadError && (
            <div className="um-error" role="alert">
              <span>{loadError}</span>
              <button type="button" onClick={fetchUsers}>
                Retry
              </button>
            </div>
          )}

          <div className="um-table-wrap">
            <table className="um-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th aria-label="Select user" />
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="um-table-message">
                      <span className="um-spinner" />
                      Loading user accounts...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan="5" className="um-table-message">
                      User records could not be loaded.
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="um-table-message">
                      <div className="um-empty-icon">⌕</div>
                      <strong>No users found</strong>
                      <p>Try changing your search or filters.</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className={
                        selectedUser?.id === user.id ? "um-row-selected" : ""
                      }
                      onClick={() => setSelectedUser(user)}
                    >
                      <td>
                        <div className="um-user-cell">
                          <span className="um-avatar">
                            {getInitials(user.full_name)}
                          </span>

                          <span className="um-user-info">
                            <strong>
                              {user.full_name || "Unnamed user"}
                            </strong>
                            <small>{user.email}</small>
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className="um-role">
                          {formatRole(user.role)}
                        </span>
                      </td>

                      <td>
                        <span className={`um-status um-status-${user.status}`}>
                          <span />
                          {formatStatus(user.status)}
                        </span>
                      </td>

                      <td className="um-date">
                        {formatDate(user.created_at)}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="um-row-action"
                          aria-label={`View ${user.full_name || "user"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedUser(user);
                          }}
                        >
                          ›
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="um-pagination">
            <span>
              Page {page} of {Math.max(totalPages, 1)}
            </span>

            <div>
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>

              <button
                type="button"
                disabled={loading || page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* SELECTED USER DETAILS */}
        <aside className="um-details">
          <div className="um-details-heading">
            <div>
              <h2>Account details</h2>
              <p>Selected user profile</p>
            </div>

            {selectedUser && (
              <span className="um-details-id">
                #{selectedUser.id.slice(0, 6)}
              </span>
            )}
          </div>

          {!selectedUser ? (
            <div className="um-details-empty">
              <span>♙</span>
              <strong>No account selected</strong>
              <p>Select a user from the table to view their details.</p>
            </div>
          ) : (
            <>
              <div className="um-profile">
                <span className="um-profile-avatar">
                  {getInitials(selectedUser.full_name)}
                </span>

                <h3>{selectedUser.full_name || "Unnamed user"}</h3>
                <p>{selectedUser.email}</p>

                <span className={`um-status um-status-${selectedUser.status}`}>
                  <span />
                  {formatStatus(selectedUser.status)}
                </span>
              </div>

              <div className="um-detail-section">
                <h3>Personal information</h3>

                <div className="um-detail-row">
                  <span>Email address</span>
                  <strong>{selectedUser.email || "—"}</strong>
                </div>

                <div className="um-detail-row">
                  <span>Phone number</span>
                  <strong>{selectedUser.phone || "Not provided"}</strong>
                </div>

                <div className="um-detail-row">
                  <span>Email verification</span>
                  <strong
                    className={
                      selectedUser.email_verified
                        ? "um-verified"
                        : "um-unverified"
                    }
                  >
                    {selectedUser.email_verified ? "Verified" : "Unverified"}
                  </strong>
                </div>
              </div>

              <div className="um-detail-section">
                <h3>Account information</h3>

                <div className="um-detail-row">
                  <span>Account role</span>
                  <strong>{formatRole(selectedUser.role)}</strong>
                </div>

                <div className="um-detail-row">
                  <span>Joined BloodBridge</span>
                  <strong>{formatDate(selectedUser.created_at)}</strong>
                </div>

                <div className="um-detail-row">
                  <span>Account access</span>
                  <strong>
                    {selectedUser.is_active ? "Enabled" : "Disabled"}
                  </strong>
                </div>
              </div>

              {selectedUser.role !== "super_admin" &&
                selectedUser.status !== "rejected" && (
                  <div className="um-account-actions">
                    <h3>Account controls</h3>

                    <p>
                      {selectedUser.status === "suspended"
                        ? "Restore this account's platform access."
                        : "Suspend this account if access should be restricted."}
                    </p>

                    <button
                      type="button"
                      className={
                        selectedUser.status === "suspended"
                          ? "um-button um-button-primary"
                          : "um-button um-button-danger"
                      }
                      onClick={openStatusConfirmation}
                      disabled={actionLoading}
                    >
                      {selectedUser.status === "suspended"
                        ? "Reactivate account"
                        : "Suspend account"}
                    </button>
                  </div>
                )}

              {selectedUser.role === "super_admin" && (
                <p className="um-protected-note">
                  Super Admin accounts are protected from these account
                  controls.
                </p>
              )}
            </>
          )}
        </aside>
      </div>

      {/* CONFIRMATION MODAL — MATCHES HOSPITAL VERIFICATION */}
      {confirmation && (
        <div
          className="hv-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !actionLoading
            ) {
              setConfirmation(null);
            }
          }}
        >
          <section
            className="hv-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-modal-title"
          >
            <button
              className="hv-modal-close"
              type="button"
              aria-label="Close confirmation"
              onClick={() => setConfirmation(null)}
              disabled={actionLoading}
            >
              ×
            </button>

            <span
              className={`hv-modal-icon ${
                confirmation.nextStatus === "suspended" ? "is-danger" : ""
              }`}
            >
              {confirmation.nextStatus === "suspended" ? "!" : "✓"}
            </span>

            <h2 id="um-modal-title">
              {confirmation.nextStatus === "suspended"
                ? `Suspend ${confirmation.userName}'s account?`
                : `Reactivate ${confirmation.userName}'s account?`}
            </h2>

            <p>
              {confirmation.nextStatus === "suspended"
                ? "This will change the account status to suspended. Continue only if you want to restrict this account."
                : "This will change the account status to active. Confirm only if this account should be reactivated."}
            </p>

            <div className="hv-modal-actions">
              <button
                type="button"
                className="hv-secondary-button"
                onClick={() => setConfirmation(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className="hv-primary-button"
                onClick={updateAccountStatus}
                disabled={actionLoading}
              >
                {actionLoading
                  ? "Processing…"
                  : confirmation.nextStatus === "suspended"
                    ? "Confirm suspension"
                    : "Confirm reactivation"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
