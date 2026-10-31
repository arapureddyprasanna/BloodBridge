import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { showToast } from "../../App";
import "./Verification.css";

const ROLE_LABELS = {
    hospital_admin: "Hospital",
    community_admin: "Community",
    donor: "Donor",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ACCEPTED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
];

function VerificationDocuments() {
    const navigate = useNavigate();

    const [verification, setVerification] = useState(null);
    const [role, setRole] = useState("");
    const [loading, setLoading] = useState(true);
    const [uploadingType, setUploadingType] = useState("");
    const [deletingId, setDeletingId] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const rejectionReason =
        verification?.rejection_reason || "";

    const getToken = useCallback(async () => {
        const user = auth.currentUser;

        if (!user) {
            navigate("/login", { replace: true });
            return null;
        }

        return user.getIdToken(true);
    }, [navigate]);

    const loadVerification = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const token = await getToken();

            if (!token) return;

            const response = await fetch(
                `${API_BASE_URL}/auth/verification/`,
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
                    data.detail ||
                    "Unable to load your verification status."
                );
            }

            if (data.verification_required === false) {
                navigate("/admin", { replace: true });
                return;
            }

            setRole(data.role || "");
            setVerification(data.verification || null);

            const currentVerification =
                data.verification || {};

            const status = currentVerification.status;

            const hasRejectedDocuments =
                currentVerification.requirements?.some(
                    (document) =>
                        document.status === "rejected"
                );

            /*
             * Submitted/under-review applications are normally
             * locked. However, if a document was individually
             * rejected, the applicant must be allowed to return
             * here and replace it.
             */
            if (
                (status === "submitted" ||
                    status === "under_review") &&
                !hasRejectedDocuments
            ) {
                navigate("/verification/pending", {
                    replace: true,
                });

                return;
            }

            if (
                status === "approved" &&
                data.account_status === "active"
            ) {
                const routes = {
                    hospital_admin: "/hospital",
                    community_admin: "/community",
                    donor: "/donor",
                };

                navigate(routes[data.role] || "/", {
                    replace: true,
                });
            }
        } catch (err) {
            setError(
                err.message ||
                "Unable to load verification information."
            );
        } finally {
            setLoading(false);
        }
    }, [getToken, navigate]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                if (!user) {
                    navigate("/login", {
                        replace: true,
                    });
                    return;
                }

                loadVerification();
            }
        );

        return () => unsubscribe();
    }, [loadVerification, navigate]);

    const requirements = useMemo(() => {
        return verification?.requirements || [];
    }, [verification]);

    const documents = requirements;

    function getDocument(documentType) {
        return documents.find(
            (document) =>
                document.document_type === documentType ||
                document.type === documentType
        );
    }

    function isRequired(requirement) {
        return (
            requirement.required === true ||
            requirement.is_required === true
        );
    }

    const requiredRequirements =
        requirements.filter(isRequired);

    const optionalRequirements =
        requirements.filter(
            (requirement) => !isRequired(requirement)
        );

    const uploadedRequiredCount =
        requiredRequirements.filter(
            (requirement) =>
                requirement.uploaded === true
        ).length;

    const requiredCount =
        requiredRequirements.length;

    const completionPercentage =
        requiredCount === 0
            ? 0
            : Math.round(
                (uploadedRequiredCount /
                    requiredCount) *
                100
            );

    function validateFile(file) {
        if (!file) {
            return "Please select a document.";
        }

        if (!ACCEPTED_TYPES.includes(file.type)) {
            return "Only PDF, JPG, and PNG files are accepted.";
        }

        if (file.size > MAX_FILE_SIZE) {
            return "The document must be 10 MB or smaller.";
        }

        return "";
    }

    async function handleUpload(documentType, file) {
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

            if (!token) return;

            const formData = new FormData();

            formData.append(
                "document_type",
                documentType
            );

            formData.append("file", file);

            const response = await fetch(
                `${API_BASE_URL}/auth/verification/documents/`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    body: formData,
                }
            );

            const data =
                await response
                    .json()
                    .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Unable to upload this document."
                );
            }

            setVerification(
                data.verification ||
                verification
            );

            showToast(
                data.message ||
                "Document uploaded successfully.",
                "success"
            );
        } catch (err) {
            showToast(
                err.message ||
                "Unable to upload the document.",
                "error"
            );
        } finally {
            setUploadingType("");
        }
    }

    async function handleDelete(documentId) {
        if (!documentId) return;

        try {
            setDeletingId(documentId);

            const token = await getToken();

            if (!token) return;

            const response = await fetch(
                `${API_BASE_URL}/auth/verification/documents/${documentId}/`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type":
                            "application/json",
                    },
                }
            );

            const data =
                await response
                    .json()
                    .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Unable to remove this document."
                );
            }

            setVerification(
                data.verification ||
                verification
            );

            showToast(
                data.message ||
                "Document removed successfully.",
                "success"
            );
        } catch (err) {
            showToast(
                err.message ||
                "Unable to remove the document.",
                "error"
            );
        } finally {
            setDeletingId("");
        }
    }

    async function handleSubmit() {
        if (
            requiredCount === 0 ||
            uploadedRequiredCount !==
            requiredCount
        ) {
            showToast(
                "Please upload all required documents before submitting.",
                "error"
            );
            return;
        }

        const rejectedRequired =
            requiredRequirements.filter(
                (requirement) => {
                    const document =
                        getDocument(
                            requirement.type
                        );

                    return (
                        document?.uploaded === true &&
                        document.status ===
                        "rejected"
                    );
                }
            );

        if (rejectedRequired.length > 0) {
            showToast(
                "Please replace all rejected required documents before submitting.",
                "error"
            );
            return;
        }

        try {
            setSubmitting(true);

            const token = await getToken();

            if (!token) return;

            const response = await fetch(
                `${API_BASE_URL}/auth/verification/submit/`,
                {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                        "Content-Type":
                            "application/json",
                    },
                }
            );

            const data =
                await response
                    .json()
                    .catch(() => ({}));

            if (!response.ok) {
                if (
                    data.missing_documents
                        ?.length
                ) {
                    const missingLabels =
                        data.missing_documents
                            .map(
                                (item) =>
                                    item.label
                            )
                            .join(", ");

                    throw new Error(
                        `Missing required documents: ${missingLabels}`
                    );
                }

                throw new Error(
                    data.detail ||
                    "Unable to submit your verification application."
                );
            }

            setVerification(
                data.verification ||
                verification
            );

            showToast(
                data.message ||
                "Verification application submitted successfully.",
                "success"
            );

            navigate(
                "/verification/pending",
                { replace: true }
            );
        } catch (err) {
            showToast(
                err.message ||
                "Unable to submit the application.",
                "error"
            );
        } finally {
            setSubmitting(false);
        }
    }

    function getStatusLabel(document) {
        if (!document) return "";

        switch (document.status) {
            case "verified":
                return "Verified";

            case "rejected":
                return "Needs replacement";

            default:
                return "Uploaded";
        }
    }

    if (loading) {
        return (
            <main className="verification-page">
                <section className="verification-shell verification-loading">
                    <div className="verification-spinner" />
                    <p>
                        Loading your verification application...
                    </p>
                </section>
            </main>
        );
    }

    if (error && !verification) {
        return (
            <main className="verification-page">
                <section className="verification-shell">
                    <div className="verification-error">
                        <span>!</span>

                        <h1>
                            Unable to load verification
                        </h1>

                        <p>{error}</p>

                        <button
                            type="button"
                            className="verification-primary-button"
                            onClick={loadVerification}
                        >
                            Try again
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="verification-page">
            <section className="verification-shell">
                <header className="verification-header">
                    <div>
                        <span className="verification-eyebrow">
                            BLOODBRIDGE VERIFICATION
                        </span>

                        <h1>
                            Complete your verification
                        </h1>

                        <p>
                            Your account needs a few official
                            documents before you can access
                            BloodBridge.
                        </p>
                    </div>

                    <div className="verification-role-badge">
                        {ROLE_LABELS[role] ||
                            "Applicant"}
                    </div>
                </header>

                {rejectionReason && (
                    <div className="verification-alert verification-alert-danger">
                        <div className="verification-alert-icon">
                            !
                        </div>

                        <div>
                            <strong>
                                Changes are required
                            </strong>

                            <p>
                                Your previous verification
                                application was rejected and
                                needs attention.
                            </p>

                            <span>
                                {rejectionReason}
                            </span>
                        </div>
                    </div>
                )}

                <section className="verification-progress-card">
                    <div className="verification-progress-heading">
                        <div>
                            <span>
                                DOCUMENT PROGRESS
                            </span>

                            <strong>
                                {uploadedRequiredCount} of{" "}
                                {requiredCount} required
                                documents
                            </strong>
                        </div>

                        <strong>
                            {completionPercentage}%
                        </strong>
                    </div>

                    <div className="verification-progress-track">
                        <div
                            className="verification-progress-fill"
                            style={{
                                width:
                                    `${completionPercentage}%`,
                            }}
                        />
                    </div>

                    <p>
                        Upload clear, valid documents. Each
                        document will be reviewed individually
                        by a BloodBridge verification reviewer.
                    </p>
                </section>

                <section className="verification-document-section">
                    <div className="verification-section-heading">
                        <div>
                            <span>
                                REQUIRED DOCUMENTS
                            </span>

                            <h2>
                                Verification documents
                            </h2>
                        </div>
                    </div>

                    <div className="verification-document-list">
                        {requiredRequirements.map(
                            (requirement) => {
                                const document =
                                    getDocument(
                                        requirement.type
                                    );

                                const isUploaded =
                                    document?.uploaded ===
                                    true;

                                const isUploading =
                                    uploadingType ===
                                    requirement.type;

                                const isRejected =
                                    isUploaded &&
                                    document?.status ===
                                    "rejected";

                                return (
                                    <article
                                        className={`verification-document-card ${isRejected
                                                ? "is-rejected"
                                                : isUploaded
                                                    ? "is-uploaded"
                                                    : ""
                                            }`}
                                        key={
                                            requirement.type
                                        }
                                    >
                                        <div className="verification-document-main">
                                            <div className="verification-document-icon">
                                                {isUploaded
                                                    ? isRejected
                                                        ? "!"
                                                        : "✓"
                                                    : "↑"}
                                            </div>

                                            <div className="verification-document-info">
                                                <div className="verification-document-title-row">
                                                    <h3>
                                                        {requirement.label ||
                                                            requirement.name ||
                                                            requirement.type}
                                                    </h3>

                                                    <span className="verification-required-badge">
                                                        Required
                                                    </span>
                                                </div>

                                                {isUploaded ? (
                                                    <>
                                                        <p>
                                                            {document.file_name ||
                                                                document.name ||
                                                                "Document uploaded"}
                                                        </p>

                                                        <span
                                                            className={`verification-document-status ${document.status}`}
                                                        >
                                                            {getStatusLabel(
                                                                document
                                                            )}
                                                        </span>

                                                        {isRejected &&
                                                            document.rejection_reason && (
                                                                <div className="verification-rejection-reason">
                                                                    <strong>
                                                                        Reviewer note:
                                                                    </strong>{" "}
                                                                    {
                                                                        document.rejection_reason
                                                                    }
                                                                </div>
                                                            )}
                                                    </>
                                                ) : (
                                                    <p>
                                                        Upload a valid
                                                        official
                                                        document.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="verification-document-actions">
                                            {isUploaded && document.id && (
                                                <button
                                                    type="button"
                                                    className="verification-view-button"
                                                    onClick={async () => {
                                                        const token = await getToken();

                                                        if (!token) return;

                                                        const url =
                                                            `${API_BASE_URL}/auth/verification/documents/${document.id}/view/`;

                                                        const response = await fetch(url, {
                                                            headers: {
                                                                Authorization: `Bearer ${token}`,
                                                            },
                                                        });

                                                        if (!response.ok) {
                                                            showToast(
                                                                "Unable to open this document.",
                                                                "error"
                                                            );
                                                            return;
                                                        }

                                                        const blob = await response.blob();
                                                        const blobUrl = URL.createObjectURL(blob);

                                                        window.open(
                                                            blobUrl,
                                                            "_blank",
                                                            "noopener,noreferrer"
                                                        );

                                                        setTimeout(() => {
                                                            URL.revokeObjectURL(blobUrl);
                                                        }, 60000);
                                                    }}
                                                >
                                                    View
                                                </button>
                                            )}
                                            <label
                                                className={`verification-upload-button ${isUploading
                                                        ? "is-loading"
                                                        : ""
                                                    }`}
                                            >
                                                {isUploading
                                                    ? "Uploading..."
                                                    : isUploaded
                                                        ? "Replace"
                                                        : "Upload"}

                                                <input
                                                    type="file"
                                                    accept=".pdf,.jpg,.jpeg,.png"
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
                                                            handleUpload(
                                                                requirement.type,
                                                                file
                                                            );
                                                        }

                                                        event.target.value =
                                                            "";
                                                    }}
                                                />
                                            </label>

                                            {isUploaded &&
                                                !isUploading &&
                                                document.id &&
                                                document.status !==
                                                "verified" && (
                                                    <button
                                                        type="button"
                                                        className="verification-delete-button"
                                                        disabled={
                                                            deletingId ===
                                                            document.id
                                                        }
                                                        onClick={() =>
                                                            handleDelete(
                                                                document.id
                                                            )
                                                        }
                                                    >
                                                        {deletingId ===
                                                            document.id
                                                            ? "Removing..."
                                                            : "Remove"}
                                                    </button>
                                                )}
                                        </div>
                                    </article>
                                );
                            }
                        )}
                    </div>
                </section>

                {optionalRequirements.length > 0 && (
                    <section className="verification-document-section">
                        <div className="verification-section-heading">
                            <div>
                                <span>
                                    OPTIONAL DOCUMENTS
                                </span>

                                <h2>
                                    Additional documents
                                </h2>
                            </div>
                        </div>

                        <div className="verification-document-list">
                            {optionalRequirements.map(
                                (requirement) => {
                                    const document =
                                        getDocument(
                                            requirement.type
                                        );

                                    const isUploaded =
                                        document?.uploaded ===
                                        true;

                                    const isUploading =
                                        uploadingType ===
                                        requirement.type;

                                    const isRejected =
                                        isUploaded &&
                                        document?.status ===
                                        "rejected";

                                    return (
                                        <article
                                            className={`verification-document-card ${isRejected
                                                    ? "is-rejected"
                                                    : isUploaded
                                                        ? "is-uploaded"
                                                        : ""
                                                }`}
                                            key={
                                                requirement.type
                                            }
                                        >
                                            <div className="verification-document-main">
                                                <div className="verification-document-icon">
                                                    {isUploaded
                                                        ? isRejected
                                                            ? "!"
                                                            : "✓"
                                                        : "↑"}
                                                </div>

                                                <div className="verification-document-info">
                                                    <div className="verification-document-title-row">
                                                        <h3>
                                                            {requirement.label ||
                                                                requirement.name ||
                                                                requirement.type}
                                                        </h3>

                                                        <span className="verification-optional-badge">
                                                            Optional
                                                        </span>
                                                    </div>

                                                    {isUploaded ? (
                                                        <>
                                                            <p>
                                                                {document.file_name ||
                                                                    document.name ||
                                                                    "Document uploaded"}
                                                            </p>

                                                            <span
                                                                className={`verification-document-status ${document.status}`}
                                                            >
                                                                {getStatusLabel(
                                                                    document
                                                                )}
                                                            </span>

                                                            {isRejected &&
                                                                document.rejection_reason && (
                                                                    <div className="verification-rejection-reason">
                                                                        <strong>
                                                                            Reviewer
                                                                            note:
                                                                        </strong>{" "}
                                                                        {
                                                                            document.rejection_reason
                                                                        }
                                                                    </div>
                                                                )}
                                                        </>
                                                    ) : (
                                                        <p>
                                                            You may provide
                                                            this document if
                                                            applicable.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="verification-document-actions">
                                                <label
                                                    className={`verification-upload-button ${isUploading
                                                            ? "is-loading"
                                                            : ""
                                                        }`}
                                                >
                                                    {isUploading
                                                        ? "Uploading..."
                                                        : isUploaded
                                                            ? "Replace"
                                                            : "Upload"}

                                                    <input
                                                        type="file"
                                                        accept=".pdf,.jpg,.jpeg,.png"
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
                                                                handleUpload(
                                                                    requirement.type,
                                                                    file
                                                                );
                                                            }

                                                            event.target.value =
                                                                "";
                                                        }}
                                                    />
                                                </label>

                                                {isUploaded &&
                                                    !isUploading &&
                                                    document.id && (
                                                        <button
                                                            type="button"
                                                            className="verification-delete-button"
                                                            disabled={
                                                                deletingId ===
                                                                document.id
                                                            }
                                                            onClick={() =>
                                                                handleDelete(
                                                                    document.id
                                                                )
                                                            }
                                                        >
                                                            {deletingId ===
                                                                document.id
                                                                ? "Removing..."
                                                                : "Remove"}
                                                        </button>
                                                    )}
                                            </div>
                                        </article>
                                    );
                                }
                            )}
                        </div>
                    </section>
                )}

                <section className="verification-submit-card">
                    <div>
                        <span className="verification-submit-kicker">
                            READY TO SUBMIT?
                        </span>

                        <h2>
                            {uploadedRequiredCount ===
                                requiredCount
                                ? "Your required documents are complete."
                                : "Complete all required documents first."}
                        </h2>

                        <p>
                            Once submitted, your documents will
                            be locked while the BloodBridge
                            verification team reviews them.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="verification-primary-button"
                        disabled={
                            submitting ||
                            requiredCount === 0 ||
                            uploadedRequiredCount !==
                            requiredCount
                        }
                        onClick={handleSubmit}
                    >
                        {submitting
                            ? "Submitting..."
                            : "Submit for verification"}

                        {!submitting && (
                            <span> →</span>
                        )}
                    </button>
                </section>

                <footer className="verification-footer">
                    <span className="verification-footer-dot" />

                    <span>
                        Your documents are used only for
                        BloodBridge verification and review.
                    </span>
                </footer>
            </section>
        </main>
    );
}

export default VerificationDocuments;
