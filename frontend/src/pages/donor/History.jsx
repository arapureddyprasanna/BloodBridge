import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import {
  DonationTable,
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
} from "./DonorComponents";
import "./DonorWorkspace.css";

export default function DonorHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;

      if (!user) {
        setRows([]);
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/donations/donor-history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load donation history.");
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];

      setRows(list);
    } catch (error) {
      console.error("Donor history load failed:", error);
      showToast(error.message || "Unable to load donation history.", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filters = ["All", "Completed", "Scheduled", "Cancelled"];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const status = String(row.status || "completed").toLowerCase();
      const matchesFilter =
        activeFilter === "All" ||
        (activeFilter === "Completed" && status === "completed") ||
        (activeFilter === "Scheduled" && status === "scheduled") ||
        (activeFilter === "Cancelled" && status === "cancelled");

      if (!matchesFilter) return false;
      if (!query) return true;

      const haystack = [
        row.hospital || row.hospital_name,
        row.request_id || row.blood_request_id,
        row.status,
        row.blood_group,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activeFilter, rows, search]);

  return (
    <div className="bb-page-shell">
      <PageHeader
        eyebrow="DONATION WORKSPACE"
        title="Donation History"
        subtitle="A record of completed and scheduled donations linked to your donor activity."
      />

      <FilterBar
        search={search}
        setSearch={setSearch}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        filters={filters}
        placeholder="Search by hospital or request ID"
      />

      {loading ? (
        <LoadingState message="Loading donation history..." />
      ) : filteredRows.length ? (
        <DonationTable rows={filteredRows} />
      ) : (
        <EmptyState
          title="No donation history yet"
          message="Your donation log will appear here once an accepted request is marked as completed or scheduled."
          icon="▥"
        />
      )}
    </div>
  );
}
