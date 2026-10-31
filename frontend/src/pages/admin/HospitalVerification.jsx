import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import "./HospitalVerification.css";

const TABS = [
  { key: "pending", label: "Pending applications" },
  { key: "verified", label: "Verified" },
  { key: "needs_info", label: "Needs information" },
  { key: "rejected", label: "Rejected" },
];

function getStatus(application) {
  const verificationStatus = String(
    application.verification_status ||
      application.application_status ||
      application.status ||
      application.account_status ||
      "pending"
  ).toLowerCase();

  if (verificationStatus === "approved") return "verified";
  if (verificationStatus === "rejected") return "rejected";

  if (
    verificationStatus === "under_review" ||
    verificationStatus === "needs_info" ||
    verificationStatus === "awaiting_information"
  ) {
    return "needs_info";
  }

  return "pending";
}

function getName(hospital) {
  return (
    hospital.hospital_name ||
    hospital.organization_name ||
    hospital.full_name ||
    hospital.name ||
    "Hospital applicant"
  );
}

function getDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function getDateTime(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
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

function MetricCard({ icon, label, value, note, accent }) {
  return (
    <article className={`hv-metric-card ${accent || ""}`}>
      <div className="hv-metric-top">
        <span>{label}</span>

        <span className="hv-metric-icon" aria-hidden="true">
          {icon}
        </span>
      </div>

      <strong>{value}</strong>

      <p>{note}</p>
    </article>
  );
}

function StatusBadge({ status }) {
  const labels = {
    pending: "Pending review",
    verified: "Verified",
    needs_info: "Under review",
    rejected: "Rejected",
  };

  return (
    <span className={`hv-status-badge hv-status-${status}`}>
      <span className="hv-status-dot" />
      {labels[status] || "Pending review"}
    </span>
  );
}

function DocumentStatus({ status }) {
  if (!status) {
    return (
      <span className="hv-document-status hv-document-missing">
        Missing
      </span>
    );
  }

  const normalized = String(status).toLowerCase();

  if (normalized === "verified") {
    return (
      <span className="hv-document-status hv-document-verified">
        ✓ Verified
      </span>
    );
  }

  if (normalized === "rejected") {
    return (
      <span className="hv-document-status hv-document-rejected">
        Rejected
      </span>
    );
  }

  return (
    <span className="hv-document-status hv-document-pending">
      Pending review
    </span>
  );
}

function DocumentRow({
  document,
  onOpen,
  onVerify,
  onReject,
  processingDocumentId,
}) {
  const isProcessing = processingDocumentId === document.id;
  const hasDocument = Boolean(document.id);
  const status = String(document.status || "").toLowerCase();

  return (
    <div className="hv-document-row">
      <span className="hv-document-icon" aria-hidden="true">
        {hasDocument ? "PDF" : "—"}
      </span>

      <div className="hv-document-copy">
        <strong>
          {document.label || document.document_type}
          {document.required ? " *" : ""}
        </strong>

        <span>
          {hasDocument
            ? document.uploaded_at
              ? `Uploaded ${getDate(document.uploaded_at)}`
              : "Document uploaded"
            : "Required document has not been uploaded"}
        </span>

        {document.rejection_reason && (
          <small className="hv-document-rejection-reason">
            Reason: {document.rejection_reason}
          </small>
        )}
      </div>

      <DocumentStatus status={document.status} />

      {hasDocument && (
        <div className="hv-document-actions">
          <button
            type="button"
            className="hv-document-action"
            onClick={() => onOpen(document)}
            disabled={isProcessing}
            title="Open document"
          >
            ↗
          </button>

          {status !== "verified" && (
            <>
              <button
                type="button"
                className="hv-document-verify"
                onClick={() => onVerify(document)}
                disabled={isProcessing}
                title="Verify document"
              >
                {isProcessing ? "…" : "Verify"}
              </button>

              <button
                type="button"
                className="hv-document-reject"
                onClick={() => onReject(document)}
                disabled={isProcessing}
                title="Reject document"
              >
                Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function HospitalVerification() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);

  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [processingDocumentId, setProcessingDocumentId] = useState(null);

  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const getToken = async () => {
    const user = auth.currentUser;

    if (!user) {
      throw new Error(
        "Your Firebase session is unavailable. Please sign in again."
      );
    }

    return user.getIdToken();
  };

  const loadApplicationDetails = useCallback(async (userId) => {
    if (!userId) {
      setSelectedDetails(null);
      setDetailsError("No applicant ID was provided.");
      return;
    }

    setDetailsLoading(true);
    setDetailsError("");
    setSelectedDetails(null);

    try {
      const token = await getToken();

      const url =
        `${API_BASE_URL}/superadmin/applications/` +
        `${encodeURIComponent(userId)}/details/`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            `Unable to load application details (${response.status}).`
        );
      }

      setSelectedDetails(data);
    } catch (err) {
      console.error(
        "[BloodBridge] Application detail loading failed:",
        err
      );

      setSelectedDetails(null);

      const message =
        err?.message ||
        "Unable to load application details.";

      setDetailsError(message);

      showToast(message, "error");
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const loadHospitals = useCallback(async () => {
  setLoading(true);
  setError("");

  try {
    const token = await getToken();

    const statuses = [
      "pending",
      "verified",
      "rejected",
    ];

    const responses = await Promise.all(
      statuses.map((status) =>
        fetch(
          `${API_BASE_URL}/superadmin/pending-applications/?role=hospital&status=${status}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        )
      )
    );

    const dataList = await Promise.all(
      responses.map(async (response) => {
        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.detail ||
              data.message ||
              "Unable to load hospital applications."
          );
        }

        return data;
      })
    );

    const applications = dataList.flatMap(
      (data) =>
        Array.isArray(data)
          ? data
          : data.results ||
            data.applications ||
            []
    );

    // Remove duplicates by applicant ID.
    const uniqueApplications = Array.from(
      new Map(
        applications.map((application) => [
          String(
            application.id ||
              application.user_id ||
              application.application_id
          ),
          application,
        ])
      ).values()
    );

    setHospitals(uniqueApplications);

    setSelectedId((currentId) => {
      if (
        currentId &&
        uniqueApplications.some(
          (application) =>
            String(
              application.id ||
                application.user_id
            ) === String(currentId)
        )
      ) {
        return currentId;
      }

      const firstPending =
        uniqueApplications.find(
          (application) =>
            getStatus(application) === "pending"
        );

      const first =
        firstPending ||
        uniqueApplications[0];

      if (!first) {
        return null;
      }

      return (
        first.id ||
        first.user_id
      );
    });
  } catch (err) {
    console.error(
      "[BloodBridge] Hospital applications loading failed:",
      err
    );

    setError(
      err?.message ||
        "Unable to load hospital applications."
    );
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    loadHospitals();
  }, [loadHospitals]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetails(null);
      setDetailsError("");
      return;
    }

    loadApplicationDetails(selectedId);
  }, [selectedId, loadApplicationDetails]);

  const cities = useMemo(
    () =>
      [
        ...new Set(
          hospitals
            .map(
              (hospital) =>
                hospital.city ||
                hospital.location?.city
            )
            .filter(Boolean)
        ),
      ].sort(),
    [hospitals]
  );

  const counts = useMemo(() => {
    const result = {
      pending: 0,
      verified: 0,
      needs_info: 0,
      rejected: 0,
    };

    hospitals.forEach((hospital) => {
      result[getStatus(hospital)] += 1;
    });

    return result;
  }, [hospitals]);

  const filteredHospitals = useMemo(() => {
    const query = search.trim().toLowerCase();

    return hospitals
      .filter(
        (hospital) =>
          getStatus(hospital) === activeTab
      )
      .filter((hospital) => {
        const city =
          hospital.city ||
          hospital.location?.city ||
          "";

        return (
          cityFilter === "all" ||
          city === cityFilter
        );
      })
      .filter((hospital) => {
        if (!query) return true;

        return [
          getName(hospital),
          hospital.email,
          hospital.mobile_number,
          hospital.phone,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(query)
          );
      })
      .sort((a, b) => {
        const dateA =
          new Date(
            a.submitted_at ||
              a.created_at ||
              0
          ).getTime() || 0;

        const dateB =
          new Date(
            b.submitted_at ||
              b.created_at ||
              0
          ).getTime() || 0;

        return sortOrder === "newest"
          ? dateB - dateA
          : dateA - dateB;
      });
  }, [
    hospitals,
    activeTab,
    search,
    cityFilter,
    sortOrder,
  ]);

  const selectedHospital = hospitals.find(
    (hospital) =>
      String(
        hospital.id ||
          hospital.user_id
      ) === String(selectedId)
  );

  const selectedStatus = selectedHospital
    ? getStatus(selectedHospital)
    : "pending";

  const selectedApplication =
    selectedDetails?.application || null;

  const selectedApplicant =
    selectedDetails?.applicant ||
    selectedHospital ||
    null;

  const selectedDocuments =
    selectedDetails?.documents || [];

  const requiredDocuments =
    selectedDocuments.filter(
      (document) => document.required
    );

  const verifiedRequiredDocuments =
    requiredDocuments.filter(
      (document) =>
        String(document.status).toLowerCase() ===
        "verified"
    );

  const allRequiredDocumentsVerified =
    requiredDocuments.length > 0 &&
    requiredDocuments.every(
      (document) =>
        String(document.status).toLowerCase() ===
        "verified"
    );

  const hasMissingRequiredDocuments =
    requiredDocuments.some(
      (document) => !document.id
    );

  const hasRejectedRequiredDocuments =
    requiredDocuments.some(
      (document) =>
        String(document.status).toLowerCase() ===
        "rejected"
    );

  const approveDisabled =
    processingId !== null ||
    detailsLoading ||
    !selectedApplication ||
    selectedApplication.status === "approved" ||
    !allRequiredDocumentsVerified ||
    hasMissingRequiredDocuments ||
    hasRejectedRequiredDocuments;

  const performDocumentDecision = async (
    document,
    decision,
    reason = ""
  ) => {
    if (!document?.id) return;

    setProcessingDocumentId(document.id);

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/superadmin/verification/documents/${document.id}/decision/`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            ...(decision === "reject"
              ? { rejection_reason: reason }
              : {}),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Unable to ${decision} this document.`
        );
      }

      showToast(
        decision === "verify"
          ? "Document verified successfully."
          : "Document rejected successfully.",
        "success"
      );

      setConfirmation(null);
      setRejectionReason("");

      await loadApplicationDetails(selectedId);
      await loadHospitals();
    } catch (err) {
      showToast(
        err?.message ||
          "The document action could not be completed.",
        "error"
      );
    } finally {
      setProcessingDocumentId(null);
    }
  };

  const openDocument = async (document) => {
    if (!document?.id) return;

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/superadmin/verification/documents/${document.id}/download/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        throw new Error(
          data.detail || "Unable to open this document."
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      window.open(url, "_blank", "noopener,noreferrer");

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
    } catch (err) {
      showToast(
        err?.message ||
          "Unable to open the document.",
        "error"
      );
    }
  };

  const finalApplicationDecision = async () => {
    if (!confirmation || !selectedHospital) return;

    const decision = confirmation.decision;

    if (
      decision === "approve" &&
      !allRequiredDocumentsVerified
    ) {
      showToast(
        "Every required document must be verified before approval.",
        "error"
      );

      setConfirmation(null);
      return;
    }

    if (
      decision === "reject" &&
      !rejectionReason.trim()
    ) {
      showToast(
        "Please provide a rejection reason.",
        "error"
      );

      return;
    }

    const hospitalId =
      selectedHospital.id ||
      selectedHospital.user_id;

    if (!hospitalId) {
      showToast(
        "This application does not have a valid ID.",
        "error"
      );

      return;
    }

    setProcessingId(hospitalId);

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/superadmin/applications/${hospitalId}/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            ...(decision === "reject"
              ? {
                  rejection_reason:
                    rejectionReason.trim(),
                }
              : {}),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Unable to ${decision} this application.`
        );
      }

      showToast(
        decision === "approve"
          ? "Hospital application approved."
          : "Hospital application rejected.",
        "success"
      );

      setConfirmation(null);
      setRejectionReason("");
      setSelectedDetails(null);

      await loadHospitals();
    } catch (err) {
      showToast(
        err?.message ||
          "The application action could not be completed.",
        "error"
      );
    } finally {
      setProcessingId(null);
    }
  };

  const detailValue = (value) =>
    value === null ||
    value === undefined ||
    value === ""
      ? "Not provided"
      : value;

  return (
    <section className="hv-page">
      <div className="hv-page-heading">
        <div>
          <div className="hv-breadcrumb">
            <span>Administration</span>
            <span>/</span>
            <span>Verification</span>
          </div>

          <h1>Hospital Verification</h1>

          <p>
            Review submitted hospital applications and
            verify organizations joining BloodBridge.
          </p>
        </div>

        <button
          className="hv-refresh-button"
          type="button"
          onClick={loadHospitals}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>

          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="hv-error" role="alert">
          <span>{error}</span>

          <button
            type="button"
            onClick={loadHospitals}
          >
            Try again
          </button>
        </div>
      )}

      <div className="hv-metrics">
        <MetricCard
          icon="◷"
          label="Pending review"
          value={loading ? "—" : counts.pending}
          note="Submitted applications"
          accent="hv-metric-primary"
        />

        <MetricCard
          icon="✓"
          label="Verified hospitals"
          value={loading ? "—" : counts.verified}
          note="Approved organizations"
        />

        <MetricCard
          icon="▤"
          label="Under review"
          value={loading ? "—" : counts.needs_info}
          note="Applications being reviewed"
        />

        <MetricCard
          icon="◴"
          label="Rejected"
          value={loading ? "—" : counts.rejected}
          note="Rejected applications"
        />
      </div>

      <div className="hv-filter-bar">
        <label className="hv-search">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search hospitals..."
            aria-label="Search hospital applications"
          />
        </label>

        <div className="hv-filter-row">
          <label className="hv-select-wrap">
            <span className="hv-sr-only">
              Filter by city
            </span>

            <select
              value={cityFilter}
              onChange={(event) =>
                setCityFilter(event.target.value)
              }
            >
              <option value="all">All cities</option>

              {cities.map((city) => (
                <option value={city} key={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>

          <label className="hv-select-wrap">
            <span className="hv-sr-only">
              Sort applications
            </span>

            <select
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value)
              }
            >
              <option value="newest">
                Newest first
              </option>

              <option value="oldest">
                Oldest first
              </option>
            </select>
          </label>

          <button
            type="button"
            className={`hv-filter-button ${
              showFilters ? "is-active" : ""
            }`}
            onClick={() =>
              setShowFilters((value) => !value)
            }
            aria-expanded={showFilters}
          >
            ☷ Filters
          </button>
        </div>

        {showFilters && (
          <div className="hv-extra-filters">
            <p>Additional filters</p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCityFilter("all");
                setSortOrder("newest");
              }}
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      <div className="hv-workspace">
        <section className="hv-applications-panel">
          <div className="hv-panel-heading">
            <div>
              <h2>Applications</h2>

              <p>
                Select an application to inspect its
                verification.
              </p>
            </div>

            <span className="hv-total-count">
              {filteredHospitals.length}
            </span>
          </div>

          <div
            className="hv-tabs"
            role="tablist"
            aria-label="Application status"
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`hv-tab ${
                  activeTab === tab.key
                    ? "is-active"
                    : ""
                }`}
                onClick={() =>
                  setActiveTab(tab.key)
                }
              >
                {tab.label}

                <span>{counts[tab.key]}</span>
              </button>
            ))}
          </div>

          <div className="hv-applicant-list">
            {loading ? (
              <div className="hv-list-state">
                <span className="hv-spinner" />

                <p>Loading applications…</p>
              </div>
            ) : filteredHospitals.length === 0 ? (
              <div className="hv-list-state">
                <span className="hv-empty-icon">⌕</span>

                <strong>No applications found</strong>

                <p>
                  {error
                    ? "Resolve the loading error and try again."
                    : "There are no applications in this category."}
                </p>
              </div>
            ) : (
              filteredHospitals.map((hospital) => {
                const id =
                  hospital.id ||
                  hospital.user_id;

                const name = getName(hospital);
                const status = getStatus(hospital);

                const isSelected =
                  String(id) === String(selectedId);

                return (
                  <button
                    className={`hv-applicant-card ${
                      isSelected
                        ? "is-selected"
                        : ""
                    }`}
                    key={id}
                    type="button"
                    onClick={() => {
                      const applicantId =
                        hospital.id ||
                        hospital.user_id;

                      setSelectedId(applicantId);
                    }}
                    aria-pressed={isSelected}
                  >
                    <span className="hv-applicant-avatar">
                      {getInitials(name)}
                    </span>

                    <span className="hv-applicant-main">
                      <strong>{name}</strong>

                      <span>
                        {hospital.city ||
                          hospital.location?.city ||
                          "Location not provided"}
                      </span>

                      <span className="hv-applicant-date">
                        Submitted{" "}
                        {getDate(
                          hospital.submitted_at ||
                            hospital.created_at
                        )}
                      </span>

                      <StatusBadge status={status} />
                    </span>

                    <span
                      className="hv-card-arrow"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section
          className="hv-inspector-panel"
          aria-label="Hospital verification details"
        >
          {!selectedHospital ? (
            <div className="hv-inspector-empty">
              <span className="hv-empty-icon">▤</span>

              <h2>Select an application</h2>

              <p>
                Choose a submitted hospital application
                to review its verification documents.
              </p>
            </div>
          ) : detailsLoading ? (
            <div className="hv-inspector-empty">
              <span className="hv-spinner" />

              <h2>Loading verification</h2>

              <p>
                Retrieving the application and its
                documents…
              </p>
            </div>
          ) : !selectedDetails ? (
            <div className="hv-inspector-empty">
              <span className="hv-empty-icon">!</span>

              <h2>Unable to load application</h2>

              <p>
                {detailsError ||
                  "Please refresh and try again."}
              </p>

              <button
                type="button"
                className="hv-primary-button"
                onClick={() =>
                  loadApplicationDetails(selectedId)
                }
                disabled={!selectedId}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="hv-inspector-header">
                <div>
                  <span className="hv-section-eyebrow">
                    VERIFICATION APPLICATION
                  </span>

                  <h2>
                    {getName(selectedApplicant)}
                  </h2>

                  <p>
                    Submitted{" "}
                    {getDateTime(
                      selectedApplication?.submitted_at
                    )}
                  </p>
                </div>

                <StatusBadge status={selectedStatus} />
              </div>

              <div className="hv-detail-section">
                <h3>Applicant information</h3>

                <div className="hv-detail-grid">
                  <div>
                    <span>Contact person</span>

                    <strong>
                      {detailValue(
                        selectedApplicant?.full_name
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Email address</span>

                    <strong>
                      {detailValue(
                        selectedApplicant?.email
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Phone number</span>

                    <strong>
                      {detailValue(
                        selectedApplicant?.phone ||
                          selectedApplicant?.mobile_number
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Role</span>

                    <strong>Hospital Admin</strong>
                  </div>

                  <div>
                    <span>Email verified</span>

                    <strong>
                      {selectedApplicant?.email_verified
                        ? "Yes"
                        : "No"}
                    </strong>
                  </div>

                  <div>
                    <span>Application submitted</span>

                    <strong>
                      {getDateTime(
                        selectedApplication?.submitted_at
                      )}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="hv-detail-section">
                <div className="hv-document-heading">
                  <div>
                    <h3>Verification documents</h3>

                    <p>
                      Every mandatory document must be
                      reviewed before approval.
                    </p>
                  </div>

                  <span className="hv-document-count">
                    {verifiedRequiredDocuments.length}/
                    {requiredDocuments.length}
                  </span>
                </div>

                <div className="hv-document-list">
                  {selectedDocuments.length > 0 ? (
                    selectedDocuments.map((document) => (
                      <DocumentRow
                        key={document.document_type}
                        document={document}
                        onOpen={openDocument}
                        onVerify={() =>
                          setConfirmation({
                            type: "document",
                            decision: "verify",
                            document,
                          })
                        }
                        onReject={() => {
                          setRejectionReason("");

                          setConfirmation({
                            type: "document",
                            decision: "reject",
                            document,
                          });
                        }}
                        processingDocumentId={
                          processingDocumentId
                        }
                      />
                    ))
                  ) : (
                    <div className="hv-no-documents">
                      <span aria-hidden="true">
                        ▤
                      </span>

                      <div>
                        <strong>
                          No verification documents
                        </strong>

                        <p>
                          No document records are
                          available for this application.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="hv-review-note">
                <span aria-hidden="true">ⓘ</span>

                <p>
                  Approval is available only after every
                  mandatory document has been individually
                  verified.
                </p>
              </div>

              {selectedApplication?.status ===
                "under_review" && (
                <div className="hv-review-note">
                  <span aria-hidden="true">✓</span>

                  <p>
                    This application is currently under
                    document review.
                  </p>
                </div>
              )}

              {selectedApplication?.status !==
                "approved" &&
                selectedApplication?.status !==
                  "rejected" && (
                  <div className="hv-inspector-actions">
                    <button
                      type="button"
                      className="hv-primary-button"
                      onClick={() =>
                        setConfirmation({
                          type: "application",
                          decision: "approve",
                        })
                      }
                      disabled={approveDisabled}
                      title={
                        !allRequiredDocumentsVerified
                          ? "Verify all required documents before approval"
                          : "Approve application"
                      }
                    >
                      {processingId
                        ? "Processing…"
                        : "Approve hospital"}{" "}
                      <span aria-hidden="true">
                        →
                      </span>
                    </button>

                    <button
                      type="button"
                      className="hv-reject-link"
                      onClick={() => {
                        setRejectionReason("");

                        setConfirmation({
                          type: "application",
                          decision: "reject",
                        });
                      }}
                      disabled={processingId !== null}
                    >
                      Reject application
                    </button>
                  </div>
                )}
            </>
          )}
        </section>
      </div>

      {confirmation && selectedHospital && (
        <div
          className="hv-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !processingId &&
              !processingDocumentId
            ) {
              setConfirmation(null);
              setRejectionReason("");
            }
          }}
        >
          <section
            className="hv-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hv-modal-title"
          >
            <button
              className="hv-modal-close"
              type="button"
              aria-label="Close confirmation"
              onClick={() => {
                setConfirmation(null);
                setRejectionReason("");
              }}
              disabled={
                processingId !== null ||
                processingDocumentId !== null
              }
            >
              ×
            </button>

            <span
              className={`hv-modal-icon ${
                confirmation.decision === "reject"
                  ? "is-danger"
                  : ""
              }`}
            >
              {confirmation.decision === "verify"
                ? "✓"
                : confirmation.decision === "approve"
                ? "✓"
                : "!"}
            </span>

            <h2 id="hv-modal-title">
              {confirmation.type === "document"
                ? confirmation.decision === "verify"
                  ? "Verify this document?"
                  : "Reject this document?"
                : confirmation.decision === "approve"
                ? `Approve ${getName(
                    selectedHospital
                  )}?`
                : `Reject ${getName(
                    selectedHospital
                  )}?`}
            </h2>

            <p>
              {confirmation.type === "document"
                ? confirmation.decision === "verify"
                  ? `You are verifying "${confirmation.document?.label}". Make sure the document is valid and appropriate for this application.`
                  : `You are rejecting "${confirmation.document?.label}". The applicant will need to replace this document before approval.`
                : confirmation.decision === "approve"
                ? "This approval will activate the hospital account. Approval is only permitted after all mandatory documents have been verified."
                : "This will reject the hospital verification application. Provide a clear reason so the applicant understands what needs attention."}
            </p>

            {confirmation.decision === "reject" && (
              <textarea
                className="hv-rejection-textarea"
                value={rejectionReason}
                onChange={(event) =>
                  setRejectionReason(event.target.value)
                }
                placeholder={
                  confirmation.type === "document"
                    ? "Explain why this document is not acceptable..."
                    : "Explain why this application is being rejected..."
                }
                rows={4}
                maxLength={1000}
                disabled={
                  processingId !== null ||
                  processingDocumentId !== null
                }
              />
            )}

            {confirmation.type === "application" &&
              confirmation.decision === "approve" &&
              !allRequiredDocumentsVerified && (
                <div className="hv-error">
                  <span>
                    Approval is blocked. Verify all required
                    documents first.
                  </span>
                </div>
              )}

            <div className="hv-modal-actions">
              <button
                type="button"
                className="hv-secondary-button"
                onClick={() => {
                  setConfirmation(null);
                  setRejectionReason("");
                }}
                disabled={
                  processingId !== null ||
                  processingDocumentId !== null
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="hv-primary-button"
                onClick={() => {
                  if (confirmation.type === "document") {
                    performDocumentDecision(
                      confirmation.document,
                      confirmation.decision,
                      rejectionReason.trim()
                    );
                  } else {
                    finalApplicationDecision();
                  }
                }}
                disabled={
                  processingId !== null ||
                  processingDocumentId !== null ||
                  (confirmation.decision === "reject" &&
                    !rejectionReason.trim()) ||
                  (confirmation.type === "application" &&
                    confirmation.decision === "approve" &&
                    !allRequiredDocumentsVerified)
                }
              >
                {processingId !== null ||
                processingDocumentId !== null
                  ? "Processing…"
                  : confirmation.decision === "verify"
                  ? "Verify document"
                  : confirmation.decision === "approve"
                  ? "Confirm approval"
                  : "Confirm rejection"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
