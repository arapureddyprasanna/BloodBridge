import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";

import { showToast } from "../../App";
import "./Verification.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const ROLE_LABELS = {
  hospital_admin: "Hospital",
  community_admin: "Community",
  donor: "Donor",
};

function PendingVerification() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const [verification, setVerification] = useState(null);
  const [accountStatus, setAccountStatus] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");

  const [uploadingType, setUploadingType] = useState("");
  const [replacementMode, setReplacementMode] = useState(false);

  /*
   * ---------------------------------------------------------
   * TOKEN
   * ---------------------------------------------------------
   */

  async function getToken() {
    const user = auth.currentUser;

    if (!user) {
      navigate("/login", {
        replace: true,
      });

      return null;
    }

    return user.getIdToken(true);
  }

  /*
   * ---------------------------------------------------------
   * LOAD VERIFICATION STATUS
   * ---------------------------------------------------------
   *
   * IMPORTANT STATE RULE:
   *
   * submitted / under_review
   *      -> STAY ON THIS PAGE
   *
   * approved
   *      -> dashboard
   *
   * whole application rejected
   *      -> documents page
   *
   * draft
   *      -> documents page
   *
   * Individual document rejection DOES NOT change the
   * application into a rejected state.
   * ---------------------------------------------------------
   */

  const loadStatus = useCallback(async (showFeedback = false) => {
    try {
      if (showFeedback) {
        setChecking(true);
      }

      setError("");

      const user = auth.currentUser;

      if (!user) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      const token = await user.getIdToken(true);

      const response = await fetch(
        `${API_BASE_URL}/auth/verification/`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to check your verification status."
        );
      }

      /*
       * Super Admin accounts do not need verification.
       */
      if (data.verification_required === false) {
        navigate("/admin", {
          replace: true,
        });

        return;
      }

      const currentVerification =
        data.verification || {};

      const currentRole = data.role || "";
      const currentAccountStatus =
        data.account_status || "";

      const currentStatus =
        currentVerification.status || "";

      /*
       * Store the latest server state first.
       */
      setVerification(currentVerification);
      setAccountStatus(currentAccountStatus);
      setRole(currentRole);

      /*
       * -------------------------------------------------------
       * APPROVED
       * -------------------------------------------------------
       */

      if (
        currentStatus === "approved" &&
        currentAccountStatus === "active"
      ) {
        const routes = {
          hospital_admin: "/hospital",
          community_admin: "/community",
          donor: "/donor/dashboard",
        };

        showToast(
          "Your BloodBridge account has been approved!",
          "success"
        );

        navigate(
          routes[currentRole] || "/",
          {
            replace: true,
          }
        );

        return;
      }

      /*
       * -------------------------------------------------------
       * WHOLE APPLICATION REJECTED
       * -------------------------------------------------------
       *
       * This is different from a rejected document.
       *
       * The verification application itself must be rejected
       * before we send the applicant back to the editable
       * verification documents page.
       * -------------------------------------------------------
       */

      if (currentStatus === "rejected") {
        navigate(
          "/verification/documents",
          {
            replace: true,
            state: {
              rejected: true,
              rejectionReason:
                currentVerification.rejection_reason ||
                "",
            },
          }
        );

        return;
      }

      /*
       * -------------------------------------------------------
       * DRAFT
       * -------------------------------------------------------
       *
       * Only a genuinely unsubmitted application should return
       * to the editable documents page.
       *
       * If the server says submitted/under_review, we NEVER
       * redirect to documents.
       * -------------------------------------------------------
       */

      if (
        currentStatus === "draft" &&
        !currentVerification.submitted_at
      ) {
        navigate(
          "/verification/documents",
          {
            replace: true,
          }
        );

        return;
      }

      /*
       * -------------------------------------------------------
       * SUBMITTED / UNDER REVIEW
       * -------------------------------------------------------
       *
       * This is the important fix.
       *
       * Regardless of individual document statuses, the
       * application remains on the pending page while the
       * application itself is submitted or under review.
       * -------------------------------------------------------
       */

      if (
        currentStatus === "submitted" ||
        currentStatus === "under_review"
      ) {
        if (showFeedback) {
          const hasRejectedDocument =
            currentVerification.requirements?.some(
              (document) =>
                document.required &&
                document.status === "rejected"
            );

          showToast(
            hasRejectedDocument
              ? "The corrected document has been submitted for review."
              : "Your verification is still under review.",
            "success"
          );
        }

        return;
      }

      /*
       * -------------------------------------------------------
       * FALLBACK
       * -------------------------------------------------------
       *
       * Do not redirect to documents merely because a document
       * is pending. The application state controls navigation.
       * -------------------------------------------------------
       */

      if (showFeedback) {
        showToast(
          "Your verification status has been refreshed.",
          "success"
        );
      }
    } catch (err) {
      console.error(
        "Verification status check failed:",
        err
      );

      setError(
        err.message ||
          "Unable to check your verification status."
      );
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [navigate]);

  /*
   * ---------------------------------------------------------
   * AUTH LISTENER
   * ---------------------------------------------------------
   */

  useEffect(() => {
  loadStatus();
}, [loadStatus]);

  /*
   * ---------------------------------------------------------
   * REJECTED DOCUMENTS
   * ---------------------------------------------------------
   *
   * Individual rejected documents are handled here.
   * They do NOT mean the whole verification application
   * is rejected.
   * ---------------------------------------------------------
   */

  const rejectedDocuments = useMemo(() => {
    return (
      verification?.requirements?.filter(
        (document) =>
          document.required &&
          document.status === "rejected"
      ) || []
    );
  }, [verification]);

  const hasRejectedDocuments =
    rejectedDocuments.length > 0;

  /*
   * ---------------------------------------------------------
   * FILE VALIDATION
   * ---------------------------------------------------------
   */

  function validateFile(file) {
    if (!file) {
      return "Please select a document.";
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      return (
        "Only PDF, JPG, and PNG files are accepted."
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return (
        "The document must be 10 MB or smaller."
      );
    }

    return "";
  }

  /*
   * ---------------------------------------------------------
   * REPLACEMENT UPLOAD
   * ---------------------------------------------------------
   */

  async function handleReplacementUpload(
    documentType,
    file
  ) {
    const validationError =
      validateFile(file);

    if (validationError) {
      showToast(
        validationError,
        "error"
      );

      return;
    }

    try {
      setUploadingType(documentType);
      setError("");

      const token = await getToken();

      if (!token) {
        return;
      }

      const formData = new FormData();

      formData.append(
        "document_type",
        documentType
      );

      formData.append(
        "file",
        file
      );

      const response = await fetch(
        `${API_BASE_URL}/auth/verification/documents/`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to upload the replacement document."
        );
      }

      /*
       * Do not assume the upload response contains the complete
       * verification object. Always refresh the authoritative
       * server state after replacement.
       */
      await loadStatus();

      setReplacementMode(false);

      showToast(
        data.message ||
          "Replacement document uploaded successfully. It is now waiting for review.",
        "success"
      );
    } catch (err) {
      console.error(
        "Replacement document upload failed:",
        err
      );

      showToast(
        err.message ||
          "Unable to upload the replacement document.",
        "error"
      );
    } finally {
      setUploadingType("");
    }
  }

  /*
   * ---------------------------------------------------------
   * FILE PICKER
   * ---------------------------------------------------------
   */

  function handleReplacementClick(
    documentType
  ) {
    if (uploadingType) {
      return;
    }

    setReplacementMode(true);

    const input =
      document.getElementById(
        `replacement-${documentType}`
      );

    if (input) {
      input.click();
    }
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="verification-page">
        <section className="verification-shell verification-loading">
          <div className="verification-spinner" />

          <p>
            Checking your verification status...
          </p>
        </section>
      </main>
    );
  }

  const status =
    verification?.status ||
    "submitted";

  /*
   * ---------------------------------------------------------
   * PAGE
   * ---------------------------------------------------------
   */

  return (
    <main className="verification-page">
      <section className="verification-shell">
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="verification-header">
          <div>
            <span className="verification-eyebrow">
              BLOODBRIDGE VERIFICATION
            </span>

            <h1>
              {hasRejectedDocuments
                ? "Document correction required"
                : "Your application is under review"}
            </h1>

            <p>
              {hasRejectedDocuments
                ? "One or more submitted documents need to be corrected before your verification can be completed."
                : "Thank you for completing your verification documents. Our team will review them carefully."}
            </p>
          </div>

          <div className="verification-status-badge">
            {status === "under_review"
              ? "Under review"
              : status === "rejected"
                ? "Rejected"
                : "Submitted"}
          </div>
        </header>

        {/* =================================================
            MAIN STATUS CARD
        ================================================= */}

        <section className="verification-pending-card">
          <div className="verification-pending-icon">
            {hasRejectedDocuments
              ? "!"
              : "✓"}
          </div>

          <div className="verification-pending-content">
            <span className="verification-pending-kicker">
              {hasRejectedDocuments
                ? "ACTION REQUIRED"
                : "VERIFICATION SUBMITTED"}
            </span>

            <h2>
              {hasRejectedDocuments
                ? "A document needs to be replaced."
                : "Your documents have been received."}
            </h2>

            <p>
              {hasRejectedDocuments
                ? "The verification team rejected one or more individual documents. Replace the rejected document below without leaving this page."
                : "You submitted the required documents. Please wait until your verification is completed."}
            </p>

            {!hasRejectedDocuments && (
              <p>
                {role === "donor"
                  ? "Your selected community will review your donor documents and membership request. You can continue once the community approves your membership."
                  : "A BloodBridge reviewer will review your application and each submitted document. You can continue once your verification is approved."}
              </p>
            )}
          </div>
        </section>

        {/* =================================================
            REJECTED DOCUMENTS
        ================================================= */}

        {hasRejectedDocuments && (
          <section className="verification-pending-card">
            <div className="verification-pending-icon">
              !
            </div>

            <div className="verification-pending-content">
              <span className="verification-pending-kicker">
                REJECTED DOCUMENTS
              </span>

              <h2>
                Replace the document
                {rejectedDocuments.length > 1
                  ? "s"
                  : ""}{" "}
                below.
              </h2>

              <p>
                Select a corrected PDF,
                JPG, or PNG file. The
                replacement will be
                sent for review.
              </p>

              <div>
                {rejectedDocuments.map(
                  (document) => {
                    const documentType =
                      document.document_type ||
                      document.type;

                    const isUploading =
                      uploadingType ===
                      documentType;

                    return (
                      <div
                        key={
                          document.id ||
                          documentType
                        }
                        style={{
                          marginTop:
                            "16px",
                          padding:
                            "18px",
                          borderRadius:
                            "12px",
                          background:
                            "#FAF5F2",
                          border:
                            "1px solid #E6D8D5",
                        }}
                      >
                        <strong>
                          {document.label ||
                            document.document_type ||
                            "Verification document"}
                        </strong>

                        <p
                          style={{
                            marginTop:
                              "6px",
                            marginBottom:
                              "6px",
                          }}
                        >
                          <strong>
                            Rejection reason:
                          </strong>{" "}
                          {document.rejection_reason ||
                            "The submitted document was not accepted. Please upload a corrected document."}
                        </p>

                        <p
                          style={{
                            marginTop:
                              "0",
                            marginBottom:
                              "16px",
                          }}
                        >
                          Current file:{" "}
                          {document.file_name ||
                            document.name ||
                            "Previously submitted document"}
                        </p>

                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: "12px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="verification-primary-button"
                            disabled={
                              Boolean(
                                uploadingType
                              )
                            }
                            onClick={() =>
                              handleReplacementClick(
                                documentType
                              )
                            }
                          >
                            {isUploading
                              ? "Uploading..."
                              : "Replace rejected document"}
                          </button>

                          <input
                            id={`replacement-${documentType}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            style={{
                              display:
                                "none",
                            }}
                            disabled={
                              isUploading
                            }
                            onChange={(
                              event
                            ) => {
                              const file =
                                event
                                  .target
                                  .files?.[0];

                              if (file) {
                                handleReplacementUpload(
                                  documentType,
                                  file
                                );
                              }

                              event.target.value =
                                "";
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              {replacementMode &&
                !uploadingType && (
                  <p
                    style={{
                      marginTop:
                        "16px",
                      marginBottom:
                        "0",
                    }}
                  >
                    Select the corrected
                    document from your
                    device.
                  </p>
                )}
            </div>
          </section>
        )}

        {/* =================================================
            TIMELINE
        ================================================= */}

        <section className="verification-timeline">
          <div className="verification-timeline-item complete">
            <div className="verification-timeline-marker">
              ✓
            </div>

            <div>
              <strong>
                Account created
              </strong>

              <span>
                Your BloodBridge account
                has been registered.
              </span>
            </div>
          </div>

          <div className="verification-timeline-line" />

          <div className="verification-timeline-item complete">
            <div className="verification-timeline-marker">
              ✓
            </div>

            <div>
              <strong>
                Documents submitted
              </strong>

              <span>
                Your required verification
                documents have been
                received.
              </span>
            </div>
          </div>

          <div className="verification-timeline-line" />

          <div className="verification-timeline-item active">
            <div className="verification-timeline-marker">
              {hasRejectedDocuments
                ? "!"
                : "•"}
            </div>

            <div>
              <strong>
                {role === "donor" ? "Community review" : "Super Admin review"}
              </strong>

              <span>
                {hasRejectedDocuments
                  ? "A submitted document needs correction."
                  : role === "donor"
                    ? "Your donor documents and membership request are waiting for community review."
                    : "Your application is waiting for verification."}
              </span>
            </div>
          </div>

          <div className="verification-timeline-line" />

          <div className="verification-timeline-item">
            <div className="verification-timeline-marker">
              4
            </div>

            <div>
              <strong>
                {role === "donor" ? "Community approval" : "Account approval"}
              </strong>

              <span>
                Dashboard access will be
                enabled after approval.
              </span>
            </div>
          </div>
        </section>

        {/* =================================================
            INFO
        ================================================= */}

        <section className="verification-info-grid">
          <article>
            <span>
              APPLICATION STATUS
            </span>

            <strong>
              {status === "under_review"
                ? "Under Review"
                : status === "rejected"
                  ? "Rejected"
                  : "Submitted"}
            </strong>
          </article>

          <article>
            <span>
              ACCOUNT STATUS
            </span>

            <strong>
              {accountStatus === "pending"
                ? "Pending Approval"
                : accountStatus ||
                  "Pending"}
            </strong>
          </article>

          <article>
            <span>
              ACCOUNT TYPE
            </span>

            <strong>
              {ROLE_LABELS[role] ||
                "Applicant"}
            </strong>
          </article>
        </section>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="verification-alert verification-alert-danger">
            <div className="verification-alert-icon">
              !
            </div>

            <div>
              <strong>
                Unable to refresh status
              </strong>

              <p>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* =================================================
            REFRESH
        ================================================= */}

        <div className="verification-pending-actions">
          <button
            type="button"
            className="verification-primary-button"
            disabled={checking}
            onClick={() =>
              loadStatus(true)
            }
          >
            {checking
              ? "Checking..."
              : "Check verification status"}
          </button>
        </div>

        {/* =================================================
            FOOTER
        ================================================= */}

        <footer className="verification-footer">
          <span className="verification-footer-dot" />

          <span>
            Thank you for helping make
            blood access safer and more
            reliable.
          </span>
        </footer>
      </section>
    </main>
  );
}

export default PendingVerification;
