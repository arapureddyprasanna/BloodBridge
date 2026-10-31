import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import "./Hospital.css";

const formatDate = (value) => {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusClass = (status) => {
  switch (status) {
    case "completed":
      return "hospital-badge-success";
    case "scheduled":
      return "hospital-badge-info";
    case "cancelled":
      return "hospital-badge-danger";
    default:
      return "hospital-badge-muted";
  }
};

const getStatusLabel = (status) => {
  if (!status) return "Unknown";

  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function DonationHistory() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDonation, setSelectedDonation] = useState(null);

  const loadDonations = useCallback(async () => {
    try {
      setLoading(true);

      const user = auth.currentUser;

      if (!user) {
        setDonations([]);
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch(`${API_BASE_URL}/donations/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load donation history.");
      }

      const data = await response.json();

      setDonations(
        Array.isArray(data)
          ? data
          : Array.isArray(data.results)
            ? data.results
            : []
      );
    } catch (error) {
      console.error("Donation history error:", error);
      showToast("Unable to load donation history.", "error");
      setDonations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDonations();
  }, [loadDonations]);

  const stats = useMemo(() => {
    const completed = donations.filter(
      (donation) => donation.status === "completed"
    );

    const scheduled = donations.filter(
      (donation) => donation.status === "scheduled"
    );

    const totalUnits = completed.reduce(
      (total, donation) =>
        total + Number(donation.units_donated || 0),
      0
    );

    return {
      total: donations.length,
      completed: completed.length,
      scheduled: scheduled.length,
      units: totalUnits,
    };
  }, [donations]);

  const filteredDonations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return donations.filter((donation) => {
      const matchesStatus =
        statusFilter === "all" || donation.status === statusFilter;

      if (!matchesStatus) return false;

      if (!query) return true;

      return [
        donation.donor_name,
        donation.donor_email,
        donation.blood_group,
        donation.blood_request_id,
        donation.request_urgency,
        donation.status,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );
    });
  }, [donations, search, statusFilter]);

  return (
    <div className="hospital-page">
      <div className="hospital-page-header">
        <div>
          <div className="hospital-page-eyebrow">
            Donation Management
          </div>

          <h1 className="hospital-page-title">
            Donation History
          </h1>

          <p className="hospital-page-subtitle">
            Review completed and scheduled donations associated with
            your blood requests.
          </p>
        </div>

        <div className="hospital-page-actions">
          <button
            type="button"
            className="hospital-secondary-button"
            onClick={loadDonations}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="hospital-kpi-grid">
        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">◷</div>
          <div>
            <span className="hospital-kpi-label">
              Total Donations
            </span>
            <strong className="hospital-kpi-value">
              {stats.total}
            </strong>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">✓</div>
          <div>
            <span className="hospital-kpi-label">
              Completed
            </span>
            <strong className="hospital-kpi-value">
              {stats.completed}
            </strong>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">◌</div>
          <div>
            <span className="hospital-kpi-label">
              Scheduled
            </span>
            <strong className="hospital-kpi-value">
              {stats.scheduled}
            </strong>
          </div>
        </div>

        <div className="hospital-kpi-card">
          <div className="hospital-kpi-icon">+</div>
          <div>
            <span className="hospital-kpi-label">
              Units Received
            </span>
            <strong className="hospital-kpi-value">
              {stats.units}
            </strong>
          </div>
        </div>
      </div>

      <div className="hospital-dashboard-card">
        <div className="hospital-card-header">
          <div>
            <h2>Donation Records</h2>
            <p>
              {filteredDonations.length} record
              {filteredDonations.length === 1 ? "" : "s"} found
            </p>
          </div>
        </div>

        <div className="hospital-filter-bar">
          <div className="hospital-search-wrapper">
            <span className="hospital-search-icon">⌕</span>

            <input
              type="search"
              className="hospital-input hospital-search-input"
              placeholder="Search donor, blood group or request..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className="hospital-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <div className="hospital-loading">
            <div className="hospital-loading-spinner" />
            <span>Loading donation history...</span>
          </div>
        ) : filteredDonations.length === 0 ? (
          <div className="hospital-empty-state">
            <div className="hospital-empty-icon">◷</div>

            <h3>
              {donations.length === 0
                ? "No donation records yet"
                : "No matching donations"}
            </h3>

            <p>
              {donations.length === 0
                ? "Donation records will appear here once donors complete donations against your blood requests."
                : "Try changing your search or status filter."}
            </p>
          </div>
        ) : (
          <div className="hospital-table-wrapper">
            <table className="hospital-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Blood Group</th>
                  <th>Units</th>
                  <th>Donation Date</th>
                  <th>Status</th>
                  <th>Request</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredDonations.map((donation) => (
                  <tr key={donation.id}>
                    <td>
                      <div className="hospital-table-primary">
                        {donation.donor_name || "Unknown donor"}
                      </div>

                      <div className="hospital-table-secondary">
                        {donation.donor_email || "—"}
                      </div>
                    </td>

                    <td>
                      <span className="hospital-blood-group">
                        {donation.blood_group || "—"}
                      </span>
                    </td>

                    <td>
                      {donation.units_donated || 0}
                    </td>

                    <td>
                      {formatDate(donation.donation_date)}
                    </td>

                    <td>
                      <span
                        className={`hospital-badge ${getStatusClass(
                          donation.status
                        )}`}
                      >
                        {getStatusLabel(donation.status)}
                      </span>
                    </td>

                    <td>
                      <span className="hospital-table-secondary">
                        {donation.blood_request_id
                          ? `#${String(
                              donation.blood_request_id
                            ).slice(0, 8)}`
                          : "—"}
                      </span>
                    </td>

                    <td>
                      <div className="hospital-table-actions">
                        <button
                          type="button"
                          className="hospital-action-button"
                          onClick={() =>
                            setSelectedDonation(donation)
                          }
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedDonation && (
        <div
          className="hospital-modal-backdrop"
          onClick={() => setSelectedDonation(null)}
        >
          <div
            className="hospital-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="hospital-modal-header">
              <div>
                <div className="hospital-page-eyebrow">
                  Donation Record
                </div>

                <h2 className="hospital-modal-title">
                  Donation Details
                </h2>
              </div>

              <button
                type="button"
                className="hospital-modal-close"
                onClick={() => setSelectedDonation(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="hospital-modal-body">
              <div className="hospital-detail-grid">
                <div>
                  <span>Donor</span>
                  <strong>
                    {selectedDonation.donor_name || "Unknown donor"}
                  </strong>
                </div>

                <div>
                  <span>Email</span>
                  <strong>
                    {selectedDonation.donor_email || "—"}
                  </strong>
                </div>

                <div>
                  <span>Blood Group</span>
                  <strong>
                    {selectedDonation.blood_group || "—"}
                  </strong>
                </div>

                <div>
                  <span>Units Donated</span>
                  <strong>
                    {selectedDonation.units_donated || 0}
                  </strong>
                </div>

                <div>
                  <span>Donation Date</span>
                  <strong>
                    {formatDateTime(
                      selectedDonation.donation_date
                    )}
                  </strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong>
                    {getStatusLabel(selectedDonation.status)}
                  </strong>
                </div>

                <div>
                  <span>Request</span>
                  <strong>
                    {selectedDonation.blood_request_id
                      ? `#${String(
                          selectedDonation.blood_request_id
                        ).slice(0, 8)}`
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>Urgency</span>
                  <strong>
                    {getStatusLabel(
                      selectedDonation.request_urgency
                    )}
                  </strong>
                </div>
              </div>

              {selectedDonation.notes && (
                <div className="hospital-modal-warning">
                  <strong>Notes</strong>
                  <p>{selectedDonation.notes}</p>
                </div>
              )}
            </div>

            <div className="hospital-modal-actions">
              <button
                type="button"
                className="hospital-secondary-button"
                onClick={() => setSelectedDonation(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DonationHistory;