import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "../../firebase";

const MAX_DONORS = 7;

function DonorMatches() {
    const { requestId } = useParams();
    const navigate = useNavigate();

    const [matches, setMatches] = useState([]);
    const [selectedDonorIds, setSelectedDonorIds] = useState([]);
    const [existingInvitations, setExistingInvitations] = useState([]);
    const [requestInfo, setRequestInfo] = useState(null);

    const [loading, setLoading] = useState(true);
    const [selecting, setSelecting] = useState(false);
    const [error, setError] = useState("");

    const getToken = async () => {
        const user = auth.currentUser;

        if (!user) {
            throw new Error("Your session has expired. Please log in again.");
        }

        return user.getIdToken();
    };

    const loadMatches = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const token = await getToken();

            const response = await fetch(
                `${API_BASE_URL}/hospital/blood-requests/${requestId}/matches/`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data?.detail || "Unable to load compatible donors."
                );
            }

            setMatches(data?.results || []);

            setRequestInfo({
                bloodGroup: data?.requested_blood_group || "",
                totalMatches: data?.total_matches || 0,
            });
        } catch (err) {
            console.error("Failed to load donor matches:", err);
            setError(
                err.message || "Something went wrong while loading donor matches."
            );
        } finally {
            setLoading(false);
        }
    }, [requestId]);

    const loadSelectedDonors = useCallback(async () => {
        try {
            const token = await getToken();

            const response = await fetch(
                `${API_BASE_URL}/hospital/blood-requests/${requestId}/matches/selected/`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            setExistingInvitations(Array.isArray(data) ? data : data?.results || []);
        } catch (err) {
            console.error("Failed to load selected donors:", err);
        }
    }, [requestId]);

    useEffect(() => {
        loadMatches();
        loadSelectedDonors();
    }, [loadMatches, loadSelectedDonors]);

    const toggleDonor = (donorId) => {
        const activeInvitationCount = existingInvitations.filter(
            (item) => item.status === "pending" || item.status === "accepted"
        ).length;
        const selectionLimit = Math.max(0, MAX_DONORS - activeInvitationCount);
        setSelectedDonorIds((current) => {
            if (current.includes(donorId)) {
                return current.filter((id) => id !== donorId);
            }

            if (current.length >= selectionLimit) {
                return current;
            }

            return [...current, donorId];
        });
    };

    const selectAll = () => {
        const activeInvitationCount = existingInvitations.filter(
            (item) => item.status === "pending" || item.status === "accepted"
        ).length;
        const selectionLimit = Math.max(0, MAX_DONORS - activeInvitationCount);
        const availableIds = matches
            .map((match) => match.donor_id)
            .filter(Boolean);

        setSelectedDonorIds(availableIds.slice(0, selectionLimit));
    };

    const clearSelection = () => {
        setSelectedDonorIds([]);
    };

    const handleSelectDonors = async () => {
        if (selectedDonorIds.length === 0) {
            setError("Select at least one donor before continuing.");
            return;
        }

        if (selectedDonorIds.length > MAX_DONORS) {
            setError(`You can select a maximum of ${MAX_DONORS} donors.`);
            return;
        }

        try {
            setSelecting(true);
            setError("");

            const token = await getToken();

            const response = await fetch(
                `${API_BASE_URL}/hospital/blood-requests/${requestId}/matches/select/`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        donor_ids: selectedDonorIds,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data?.detail || "Unable to select donors."
                );
            }

            navigate(`/requests/${requestId}/tracking`);
        } catch (err) {
            console.error("Failed to select donors:", err);
            setError(
                err.message || "Something went wrong while selecting donors."
            );
        } finally {
            setSelecting(false);
        }
    };

    const formatDistance = (distance) => {
        if (distance === null || distance === undefined) {
            return "Distance unavailable";
        }

        return `${Number(distance).toFixed(2)} km`;
    };

    const getCompatibilityLabel = (compatibility) => {
        if (!compatibility) {
            return "Compatible";
        }

        const normalized = compatibility.toString().toLowerCase();

        if (normalized.includes("not")) {
            return "Not compatible";
        }

        if (normalized.includes("compatible")) {
            return "Compatible";
        }

        return compatibility;
    };

    const activeInvitationCount = existingInvitations.filter(
        (item) => item.status === "pending" || item.status === "accepted"
    ).length;
    const remainingSlots = Math.max(0, MAX_DONORS - activeInvitationCount);

    const getInvitationStatusClass = (status) => {
        if (status === "accepted") return "hospital-badge hospital-badge-success";
        if (status === "declined") return "hospital-badge hospital-badge-danger";
        if (status === "pending") return "hospital-badge hospital-badge-warning";
        return "hospital-badge hospital-badge-muted";
    };

    if (loading) {
        return (
            <section className="hospital-page">
                <div className="hospital-page-header">
                    <div>
                        <span className="hospital-page-eyebrow">
                            Donor Matching
                        </span>

                        <h1 className="hospital-page-title">
                            Find Compatible Donors
                        </h1>

                        <p className="hospital-page-subtitle">
                            Finding eligible donors for this blood request...
                        </p>
                    </div>
                </div>

                <div className="hospital-empty-state">
                    <strong>Loading donor matches...</strong>
                    <span>
                        We are checking blood compatibility, availability, and
                        travel distance.
                    </span>
                </div>
            </section>

        );
    }

    return (

        <section className="hospital-page">
            <div className="hospital-page-header">
                <div>
                    <span className="hospital-page-eyebrow">
                        Donor Matching
                    </span>

                    <h1 className="hospital-page-title">
                        Compatible Donors
                    </h1>

                    <p className="hospital-page-subtitle">
                        Select up to {MAX_DONORS} eligible donors for this blood
                        request.
                    </p>
                </div>

                <div className="hospital-page-actions">
                    <button
                        type="button"
                        className="hospital-secondary-button"
                        onClick={() => navigate(`/requests/${requestId}`)}
                    >
                        Back to Request
                    </button>
                </div>
            </div>

            {requestInfo && (
                <div className="hospital-kpi-grid">
                    <div className="hospital-kpi-card">
                        <span className="hospital-kpi-label">
                            Requested Blood Group
                        </span>

                        <span className="hospital-kpi-value">
                            {requestInfo.bloodGroup || "—"}
                        </span>

                        <span className="hospital-kpi-meta">
                            Blood group required for this request
                        </span>
                    </div>

                    <div className="hospital-kpi-card">
                        <span className="hospital-kpi-label">
                            Compatible Donors
                        </span>

                        <span className="hospital-kpi-value">
                            {requestInfo.totalMatches}
                        </span>

                        <span className="hospital-kpi-meta">
                            Eligible donors within their travel limits
                        </span>
                    </div>

                    <div className="hospital-kpi-card">
                        <span className="hospital-kpi-label">
                            Selected
                        </span>

                        <span className="hospital-kpi-value">
                            {activeInvitationCount + selectedDonorIds.length}/{MAX_DONORS}
                        </span>

                        <span className="hospital-kpi-meta">
                            {remainingSlots} invitation slot{remainingSlots === 1 ? "" : "s"} remaining
                        </span>
                    </div>
                </div>
            )}

            {error && (
                <div className="hospital-alert hospital-alert-error">
                    <strong>Unable to continue</strong>
                    <span>{error}</span>

                    <button
                        type="button"
                        className="hospital-text-button"
                        onClick={() => {
                            setError("");
                            loadMatches();
                        }}
                    >
                        Try again
                    </button>
                </div>
            )}

            {!error && matches.length === 0 && (
                <div className="hospital-empty-state">
                    <strong>No compatible donors found</strong>

                    <span>
                        No eligible community members match this request’s blood group, current availability, location, and travel radius.
                    </span>

                    <button
                        type="button"
                        className="hospital-secondary-button"
                        onClick={() => navigate(`/requests/${requestId}`)}
                    >
                        Return to Request
                    </button>
                </div>
            )}

            {matches.length > 0 && (
                <>
                    <div className="hospital-filter-bar">
                        <div>
                            <strong>
                                {matches.length} donor
                                {matches.length === 1 ? "" : "s"} available
                            </strong>

                            <span>
                                Select donors to send them an invitation.
                            </span>
                        </div>

                        <div className="hospital-page-actions">
                            <button
                                type="button"
                                className="hospital-text-button"
                                onClick={selectAll}
                                disabled={selectedDonorIds.length >= remainingSlots || remainingSlots === 0}
                            >
                                Select up to {MAX_DONORS}
                            </button>

                            <button
                                type="button"
                                className="hospital-text-button"
                                onClick={clearSelection}
                                disabled={selectedDonorIds.length === 0}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="hospital-table-wrapper">
                        <table className="hospital-table">
                            <thead>
                                <tr>
                                    <th aria-label="Select donor"></th>
                                    <th>Blood Group</th>
                                    <th>Distance</th>
                                    <th>Availability</th>
                                    <th>Travel Limit</th>
                                    <th>Compatibility</th>
                                </tr>
                            </thead>

                            <tbody>
                                {matches.map((match) => {
                                    const donorId = match.donor_id;
                                    const isSelected =
                                        selectedDonorIds.includes(donorId);

                                    return (
                                        <tr key={donorId}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    disabled={
                                                        !isSelected &&
                                                        selectedDonorIds.length >= remainingSlots
                                                    }
                                                    onChange={() => toggleDonor(donorId)}
                                                    aria-label={`Select ${match.blood_group} donor`}
                                                />
                                            </td>

                                            <td>
                                                <strong>{match.blood_group}</strong>
                                            </td>

                                            <td>
                                                {formatDistance(match.distance_km)}
                                            </td>

                                            <td>
                                                <span className="hospital-status-badge success">
                                                    {match.is_available
                                                        ? "Available"
                                                        : "Unavailable"}
                                                </span>
                                            </td>

                                            <td>
                                                {match.max_travel_distance_km ?? "—"} km
                                            </td>

                                            <td>
                                                <span className="hospital-status-badge success">
                                                    {getCompatibilityLabel(
                                                        match.compatibility
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="hospital-request-actions">
                        <div>
                            <strong>
                                {selectedDonorIds.length} of {remainingSlots} available donor slots
                                selected
                            </strong>

                            <span>
                                Selected donors will receive an invitation. Their
                                personal contact information remains private until
                                they accept.
                            </span>
                        </div>

                        <div className="hospital-page-actions">
                            <button
                                type="button"
                                className="hospital-secondary-button"
                                onClick={() => navigate(`/requests/${requestId}`)}
                                disabled={selecting}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="hospital-primary-button"
                                onClick={handleSelectDonors}
                                disabled={
                                    selecting || selectedDonorIds.length === 0
                                }
                            >
                                {selecting
                                    ? "Sending Invitations..."
                                    : selectedDonorIds.length === 0
                                        ? "Select Donors"
                                    : `Invite ${selectedDonorIds.length} Donor${selectedDonorIds.length === 1 ? "" : "s"
                                        }`}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {existingInvitations.length > 0 && (
                <div className="hospital-card">
                    <div className="hospital-card-header">
                        <div>
                            <h2 className="hospital-card-title">Invited Donors</h2>
                            <p className="hospital-card-subtitle">Current invitation status comes from DonorInvitation records.</p>
                        </div>
                        <button type="button" className="hospital-secondary-button" onClick={() => navigate(`/requests/${requestId}/tracking`)}>Open tracking</button>
                    </div>
                    <div className="hospital-table-wrapper">
                        <table className="hospital-table">
                            <thead><tr><th>Donor</th><th>Blood Group</th><th>Distance</th><th>Status</th><th>Contact</th><th>Response Time</th></tr></thead>
                            <tbody>{existingInvitations.map((item) => <tr key={item.id}><td>{item.donor_name}</td><td>{item.blood_group}</td><td>{Number(item.distance_km).toFixed(2)} km</td><td><span className={getInvitationStatusClass(item.status)}>{item.status}</span></td><td>{item.donor_phone || "Available after acceptance"}</td><td>{item.responded_at ? new Date(item.responded_at).toLocaleString("en-IN") : "Awaiting response"}</td></tr>)}</tbody>
                        </table>
                    </div>
                </div>
            )}
        </section>
    );
}

export default DonorMatches;
