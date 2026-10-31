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

function getStatus(community) {
  const status = String(
    community.application_status ||
      community.verification_status ||
      community.status ||
      community.account_status ||
      "pending"
  ).toLowerCase();

  if (["approved", "verified"].includes(status)) {
    return "verified";
  }

  if (["rejected", "declined"].includes(status)) {
    return "rejected";
  }

  if (
    ["needs_info", "awaiting_information", "awaiting_info"].includes(status)
  ) {
    return "needs_info";
  }

  return "pending";
}

function getName(community) {
  return (
    community.community_name ||
    community.organization_name ||
    community.full_name ||
    community.name ||
    "Community applicant"
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
    needs_info: "Needs information",
    rejected: "Rejected",
  };

  return (
    <span className={`hv-status-badge hv-status-${status}`}>
      <span className="hv-status-dot" />
      {labels[status] || "Pending review"}
    </span>
  );
}

function getDocumentStatusLabel(status) {
  const labels = {
    pending: "Pending review",
    verified: "Verified",
    rejected: "Rejected",
  };

  return labels[status] || "Pending review";
}

function DocumentRow({
  document,
  onVerify,
  onReject,
  onDownload,
  processingDocumentId,
}) {
  const isProcessing = processingDocumentId === document.id;

  return (
    <article
      className={`hv-document-row ${
        document.status === "rejected"
          ? "is-rejected"
          : document.status === "verified"
            ? "is-verified"
            : ""
      }`}
    >
      <span className="hv-document-icon" aria-hidden="true">
        PDF
      </span>

      <div className="hv-document-copy">
        <strong>
          {document.label ||
            document.name ||
            document.title ||
            document.document_type ||
            "Verification document"}
        </strong>

        <span>
          {document.required ? "Required document" : "Optional document"}
          {" · "}
          {getDocumentStatusLabel(document.status)}
        </span>

        {document.rejection_reason && (
          <small className="hv-document-rejection">
            Rejection reason: {document.rejection_reason}
          </small>
        )}
      </div>

      <div className="hv-document-actions">
        <button
          type="button"
          className="hv-document-action"
          onClick={() => onDownload(document)}
          disabled={isProcessing}
          title="Open document"
        >
          View
        </button>

        {document.status === "pending" && (
          <>
            <button
              type="button"
              className="hv-document-verify"
              onClick={() => onVerify(document)}
              disabled={isProcessing}
            >
              {isProcessing ? "..." : "Verify"}
            </button>

            <button
              type="button"
              className="hv-document-reject"
              onClick={() => onReject(document)}
              disabled={isProcessing}
            >
              Reject
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function CommunityVerification() {
  const [communities, setCommunities] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  /*
   * Used to force the currently selected application's details
   * to reload whenever the applications list is refreshed.
   */
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0);

  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [processingDocumentId, setProcessingDocumentId] = useState(null);

  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const getToken = useCallback(async () => {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Please sign in again.");
    }

    return user.getIdToken();
  }, []);

  const loadApplicationDetails = useCallback(
    async (userId) => {
      if (!userId) {
        setSelectedDetails(null);
        return;
      }

      setLoadingDetails(true);

      try {
        const token = await getToken();

        const response = await fetch(
          `${API_BASE_URL}/superadmin/applications/${userId}/details/`,
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
            data.detail || "Unable to load application details."
          );
        }

        setSelectedDetails(data);
      } catch (err) {
        setSelectedDetails(null);

        showToast(
          err.message || "Unable to load application details.",
          "error"
        );
      } finally {
        setLoadingDetails(false);
      }
    },
    [getToken]
  );

  const loadCommunities = useCallback(async () => {
  setLoading(true);
  setError("");

  try {
    const token = await getToken();

    const statuses = ["pending", "verified", "rejected"];

    const responses = await Promise.all(
      statuses.map((status) =>
        fetch(
          `${API_BASE_URL}/superadmin/pending-applications/?role=community&status=${status}`,
          {
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
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.detail || "Unable to load community applications."
          );
        }

        return data;
      })
    );

    const applications = dataList.flatMap((data) =>
      Array.isArray(data)
        ? data
        : data.results || data.applications || []
    );

    const communityApplications = applications.filter(
      (application) =>
        application.role === "community_admin" ||
        application.role === "community" ||
        application.community_name ||
        application.organization_name ||
        application.user_id ||
        application.id
    );

    const uniqueApplications = Array.from(
      new Map(
        communityApplications.map((application) => {
          const key =
            application.application_id ||
            application.user_id ||
            application.id;

          return [String(key), application];
        })
      ).values()
    );

    setCommunities(uniqueApplications);

    setSelectedId((currentId) => {
      const existing = uniqueApplications.find((community) => {
        const id = community.user_id || community.id;
        return String(id) === String(currentId);
      });

      if (currentId && existing) {
        return currentId;
      }

      const firstPending = uniqueApplications.find(
        (community) => getStatus(community) === "pending"
      );

      const first = firstPending || uniqueApplications[0];

      if (!first) {
        return null;
      }

      return first.user_id || first.id;
    });

    /*
     * Important:
     * selectedId normally does not change when Refresh is clicked.
     * Therefore the selected application's details effect would not
     * run again automatically.
     *
     * Incrementing this key forces a fresh details request so the
     * inspector cannot keep displaying stale document statuses.
     */
    setDetailsRefreshKey((value) => value + 1);
  } catch (err) {
    setError(err.message || "Unable to load community applications.");
  } finally {
    setLoading(false);
  }
}, [getToken]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetails(null);
      return;
    }

    loadApplicationDetails(selectedId);
  }, [selectedId, detailsRefreshKey, loadApplicationDetails]);

  const cities = useMemo(
    () =>
      [
        ...new Set(
          communities
            .map(
              (community) =>
                community.city || community.location?.city
            )
            .filter(Boolean)
        ),
      ].sort(),
    [communities]
  );

  const counts = useMemo(() => {
    const result = {
      pending: 0,
      verified: 0,
      needs_info: 0,
      rejected: 0,
    };

    communities.forEach((community) => {
      const status = getStatus(community);

      if (result[status] !== undefined) {
        result[status] += 1;
      }
    });

    return result;
  }, [communities]);

  const filteredCommunities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return communities
      .filter((community) => getStatus(community) === activeTab)
      .filter((community) => {
        const city =
          community.city || community.location?.city || "";

        return cityFilter === "all" || city === cityFilter;
      })
      .filter((community) => {
        if (!query) return true;

        return [
          getName(community),
          community.email,
          community.mobile_number,
          community.phone,
          community.registration_number,
          community.city,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          );
      })
      .sort((a, b) => {
        const dateA =
          new Date(a.created_at || a.submitted_at || 0).getTime() || 0;

        const dateB =
          new Date(b.created_at || b.submitted_at || 0).getTime() || 0;

        return sortOrder === "newest"
          ? dateB - dateA
          : dateA - dateB;
      });
  }, [
    communities,
    activeTab,
    search,
    cityFilter,
    sortOrder,
  ]);

  const selectedCommunity = communities.find((community) => {
    const id = community.user_id || community.id;

    return String(id) === String(selectedId);
  });

  const applicantDetails =
    selectedDetails?.applicant ||
    selectedDetails?.user ||
    selectedDetails?.profile ||
    selectedCommunity ||
    {};

  const selectedStatus = selectedCommunity
    ? getStatus(selectedCommunity)
    : "pending";

  const selectedDocuments = useMemo(() => {
    const documents =
      selectedDetails?.documents ||
      selectedDetails?.verification_documents ||
      selectedDetails?.supporting_documents ||
      [];

    if (!Array.isArray(documents)) {
      return [];
    }

    return documents.map((document, index) => ({
      id: document.id ? String(document.id) : null,
      document_type: document.document_type || "",
      label:
        document.label ||
        document.name ||
        document.title ||
        document.document_type ||
        `Document ${index + 1}`,
      name:
        document.name ||
        document.title ||
        document.file_name ||
        document.document_type ||
        `Document ${index + 1}`,
      status: String(document.status || "pending").toLowerCase(),
      required: Boolean(document.required),
      rejection_reason: document.rejection_reason || "",
      uploaded_at: document.uploaded_at || null,
      url:
        document.url ||
        document.file_url ||
        document.file ||
        "",
    }));
  }, [selectedDetails]);

  const requiredDocuments = selectedDocuments.filter(
    (document) => document.required
  );

  const allRequiredDocumentsVerified =
    requiredDocuments.length > 0 &&
    requiredDocuments.every(
      (document) => document.status === "verified"
    );

  const detailValue = (value) =>
    value === null || value === undefined || value === ""
      ? "Not provided"
      : value;

  const handleDocumentDecision = async (
    document,
    decision
  ) => {
    if (!document?.id) return;

    let reason = "";

    if (decision === "reject") {
      reason = window.prompt(
        "Enter the rejection reason for this document:"
      );

      if (reason === null) {
        return;
      }

      reason = reason.trim();

      if (!reason) {
        showToast(
          "A rejection reason is required.",
          "error"
        );
        return;
      }
    }

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

      await loadApplicationDetails(selectedId);
      await loadCommunities();
    } catch (err) {
      showToast(
        err.message ||
          "The document decision could not be completed.",
        "error"
      );
    } finally {
      setProcessingDocumentId(null);
    }
  };

  const handleDownload = async (document) => {
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
      const url = URL.createObjectURL(blob);

      window.open(url, "_blank", "noopener,noreferrer");

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60000);
    } catch (err) {
      showToast(
        err.message || "Unable to open the document.",
        "error"
      );
    }
  };

  const openApprovalConfirmation = () => {
    if (!selectedCommunity) return;

    if (!allRequiredDocumentsVerified) {
      showToast(
        "All mandatory documents must be verified before approval.",
        "error"
      );
      return;
    }

    setRejectionReason("");

    setConfirmation({
      decision: "approve",
    });
  };

  const openRejectionConfirmation = () => {
    if (!selectedCommunity) return;

    setRejectionReason("");

    setConfirmation({
      decision: "reject",
    });
  };

  const approveOrReject = async () => {
    if (!confirmation || !selectedCommunity) return;

    const { decision } = confirmation;

    const communityId =
      selectedCommunity.user_id ||
      selectedCommunity.id;

    if (!communityId) {
      showToast(
        "This application does not have a valid user ID.",
        "error"
      );

      setConfirmation(null);
      return;
    }

    if (decision === "approve" && !allRequiredDocumentsVerified) {
      showToast(
        "All mandatory documents must be verified before approval.",
        "error"
      );
      return;
    }

    if (
      decision === "reject" &&
      !rejectionReason.trim()
    ) {
      showToast(
        "A rejection reason is required.",
        "error"
      );
      return;
    }

    setProcessingId(communityId);

    try {
      const token = await getToken();

      const response = await fetch(
        `${API_BASE_URL}/superadmin/applications/${communityId}/`,
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
            `Unable to ${decision} this community application.`
        );
      }

      showToast(
        decision === "approve"
          ? "Community application approved."
          : "Community application rejected.",
        "success"
      );

      setConfirmation(null);
      setRejectionReason("");
      setSelectedDetails(null);

      await loadCommunities();
    } catch (err) {
      showToast(
        err.message ||
          "The application action could not be completed.",
        "error"
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="hv-page hv-community-verification">
      <div className="hv-page-heading">
        <div>
          <div className="hv-breadcrumb">
            <span>Administration</span>
            <span>/</span>
            <span>Verification</span>
          </div>

          <h1>Community Verification</h1>

          <p>
            Review community applications and verify
            organizations joining BloodBridge.
          </p>
        </div>

        <button
          className="hv-refresh-button"
          type="button"
          onClick={loadCommunities}
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
            onClick={loadCommunities}
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
          note="Applications awaiting review"
          accent="hv-metric-primary"
        />

        <MetricCard
          icon="✓"
          label="Verified communities"
          value={loading ? "—" : counts.verified}
          note="Verified records returned by API"
        />

        <MetricCard
          icon="▤"
          label="Awaiting information"
          value={loading ? "—" : counts.needs_info}
          note="Applications needing information"
        />

        <MetricCard
          icon="◴"
          label="Within review SLA"
          value="—"
          note="Review performance"
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
            placeholder="Search communities..."
            aria-label="Search community applications"
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
                Select a community to inspect its details.
              </p>
            </div>

            <span className="hv-total-count">
              {filteredCommunities.length}
            </span>
          </div>

          <div
            className="hv-tabs"
            role="tablist"
            aria-label="Community application status"
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`hv-tab ${
                  activeTab === tab.key ? "is-active" : ""
                }`}
                onClick={() => setActiveTab(tab.key)}
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
                <p>Loading community applications…</p>
              </div>
            ) : filteredCommunities.length === 0 ? (
              <div className="hv-list-state">
                <span className="hv-empty-icon">⌕</span>

                <strong>No applications found</strong>

                <p>
                  {error
                    ? "Resolve the loading error and try again."
                    : "Try another status tab or adjust your search and filters."}
                </p>
              </div>
            ) : (
              filteredCommunities.map((community) => {
                const id =
                  community.user_id ||
                  community.id;

                const name = getName(community);
                const status = getStatus(community);

                const isSelected =
                  String(id) === String(selectedId);

                return (
                  <button
                    className={`hv-applicant-card ${
                      isSelected ? "is-selected" : ""
                    }`}
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    aria-pressed={isSelected}
                  >
                    <span className="hv-applicant-avatar">
                      {getInitials(name)}
                    </span>

                    <span className="hv-applicant-main">
                      <strong>{name}</strong>

                      <span>
                        {community.city ||
                          community.location?.city ||
                          "Location not provided"}
                      </span>

                      <span className="hv-applicant-date">
                        Submitted{" "}
                        {getDate(
                          community.submitted_at ||
                            community.created_at
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
          aria-label="Community details"
        >
          {!selectedCommunity ? (
            <div className="hv-inspector-empty">
              <span className="hv-empty-icon">▤</span>

              <h2>Select an application</h2>

              <p>
                Choose a community from the list to review its
                application.
              </p>
            </div>
          ) : loadingDetails ? (
            <div className="hv-inspector-empty">
              <span className="hv-spinner" />

              <h2>Loading application details</h2>

              <p>
                Retrieving submitted documents and verification
                information…
              </p>
            </div>
          ) : (
            <>
              <div className="hv-inspector-header">
                <div>
                  <span className="hv-section-eyebrow">
                    APPLICATION DETAILS
                  </span>

                  <h2>{getName(applicantDetails)}</h2>

                  <p>
                    Submitted{" "}
                    {getDate(
                      selectedDetails?.application?.submitted_at ||
                        selectedCommunity.submitted_at ||
                        selectedCommunity.created_at
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
                        applicantDetails.full_name ||
                          applicantDetails.contact_person
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Email address</span>

                    <strong>
                      {detailValue(applicantDetails.email)}
                    </strong>
                  </div>

                  <div>
                    <span>Phone number</span>

                    <strong>
                      {detailValue(
                        applicantDetails.mobile_number ||
                          applicantDetails.phone
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>City</span>

                    <strong>
                      {detailValue(
                        applicantDetails.city ||
                          applicantDetails.location?.city
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Registration number</span>

                    <strong>
                      {detailValue(
                        applicantDetails.registration_number ||
                          applicantDetails.license_number
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Organization type</span>

                    <strong>
                      {detailValue(
                        applicantDetails.organization_type ||
                          applicantDetails.community_type
                      )}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="hv-detail-section">
                <div className="hv-document-heading">
                  <div>
                    <h3>Supporting documents</h3>

                    <p>
                      Review documents supplied with this
                      application.
                    </p>
                  </div>

                  <span className="hv-document-count">
                    {selectedDocuments.length}
                  </span>
                </div>

                {selectedDocuments.length > 0 ? (
                  <div className="hv-document-list">
                    {selectedDocuments.map((document) => (
                      <DocumentRow
                        key={document.id || document.document_type}
                        document={document}
                        onVerify={(doc) =>
                          handleDocumentDecision(doc, "verify")
                        }
                        onReject={(doc) =>
                          handleDocumentDecision(doc, "reject")
                        }
                        onDownload={handleDownload}
                        processingDocumentId={
                          processingDocumentId
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="hv-no-documents">
                    <span aria-hidden="true">▤</span>

                    <div>
                      <strong>
                        No document details available
                      </strong>

                      <p>
                        No supporting document records were
                        returned for this application.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="hv-review-note">
                <span aria-hidden="true">ⓘ</span>

                <p>
                  Every mandatory document must be individually
                  verified before the community can be approved.
                </p>
              </div>

              {selectedStatus === "pending" && (
                <div className="hv-inspector-actions">
                  <button
                    type="button"
                    className="hv-primary-button"
                    onClick={openApprovalConfirmation}
                    disabled={
                      processingId !== null ||
                      !allRequiredDocumentsVerified
                    }
                    title={
                      !allRequiredDocumentsVerified
                        ? "Verify all mandatory documents before approval."
                        : "Approve community"
                    }
                  >
                    Approve community{" "}
                    <span aria-hidden="true">→</span>
                  </button>

                  <button
                    type="button"
                    className="hv-reject-link"
                    onClick={openRejectionConfirmation}
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

      {confirmation && selectedCommunity && (
        <div
          className="hv-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              processingId === null
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
              disabled={processingId !== null}
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
              {confirmation.decision === "approve"
                ? "✓"
                : "!"}
            </span>

            <h2 id="hv-modal-title">
              {confirmation.decision === "approve"
                ? `Approve ${getName(selectedCommunity)}?`
                : `Reject ${getName(selectedCommunity)}?`}
            </h2>

            <p>
              {confirmation.decision === "approve"
                ? "All mandatory documents must be verified before this community can be approved."
                : "Rejecting this application will prevent the community account from becoming active."}
            </p>

            {confirmation.decision === "reject" && (
              <label className="hv-rejection-field">
                <span>Rejection reason</span>

                <textarea
                  value={rejectionReason}
                  onChange={(event) =>
                    setRejectionReason(event.target.value)
                  }
                  placeholder="Enter the reason for rejecting this application..."
                  rows={4}
                  disabled={processingId !== null}
                />
              </label>
            )}

            <div className="hv-modal-actions">
              <button
                type="button"
                className="hv-secondary-button"
                onClick={() => {
                  setConfirmation(null);
                  setRejectionReason("");
                }}
                disabled={processingId !== null}
              >
                Cancel
              </button>

              <button
                type="button"
                className="hv-primary-button"
                onClick={approveOrReject}
                disabled={
                  processingId !== null ||
                  (confirmation.decision === "reject" &&
                    !rejectionReason.trim())
                }
              >
                {processingId !== null
                  ? "Processing…"
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
