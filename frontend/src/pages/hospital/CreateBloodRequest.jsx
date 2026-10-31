import { API_BASE_URL } from "../../api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";

import "./Hospital.css";

const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

const URGENCY_OPTIONS = [
  {
    value: "normal",
    label: "Normal",
    description: "Can be fulfilled within the required timeframe.",
  },
  {
    value: "urgent",
    label: "Urgent",
    description: "Blood is needed soon and requires faster coordination.",
  },
  {
    value: "critical",
    label: "Critical",
    description: "Immediate attention is required.",
  },
];

function CreateBloodRequest() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    blood_group: "",
    units_required: "",
    urgency: "normal",
    required_by: "",
    hospital_notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (errorMessage) {
      setErrorMessage("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!formData.blood_group) {
      setErrorMessage("Please select a blood group.");
      return;
    }

    const units = Number(formData.units_required);

    if (!Number.isInteger(units) || units < 1) {
      setErrorMessage(
        "Units required must be a whole number greater than 0."
      );
      return;
    }

    try {
      const user = auth.currentUser;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      setSubmitting(true);

      const token = await user.getIdToken();

      const payload = {
        blood_group: formData.blood_group,
        units_required: units,
        urgency: formData.urgency,
        hospital_notes: formData.hospital_notes.trim(),
        required_by: formData.required_by
          ? new Date(formData.required_by).toISOString()
          : null,
      };

      const response = await fetch(
        `${API_BASE_URL}/hospital/blood-requests/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (data && typeof data === "object") {
          const backendErrors = Object.entries(data)
            .map(([field, messages]) => {
              const message = Array.isArray(messages)
                ? messages.join(" ")
                : String(messages);

              return `${field}: ${message}`;
            })
            .join(" ");

          throw new Error(
            backendErrors || "Unable to create the blood request."
          );
        }

        throw new Error("Unable to create the blood request.");
      }

      navigate(`/requests/${data.id}`);
    } catch (error) {
      console.error("Blood request creation failed:", error);

      setErrorMessage(
        error.message ||
          "Unable to create the blood request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hospital-page">
      {/* PAGE HEADER */}
      <div className="hospital-page-header">
        <div>
          <p className="hospital-page-eyebrow">
            Blood request management
          </p>

          <h1 className="hospital-page-title">
            Create Blood Request
          </h1>

          <p className="hospital-page-subtitle">
            Submit a blood requirement so eligible donors can be
            coordinated through the BloodBridge network.
          </p>
        </div>

        <div className="hospital-page-actions">
          <button
            type="button"
            className="hospital-secondary-button"
            onClick={() => navigate("/requests")}
            disabled={submitting}
          >
            Back to Requests
          </button>
        </div>
      </div>

      {/* REQUEST FORM */}
      <div className="hospital-dashboard-card">
        <div className="hospital-card-header">
          <div>
            <h3>Request Information</h3>
            <p>
              Provide the blood requirement for your hospital.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div style={{ padding: "16px 18px 0" }}>
            <span className="hospital-badge hospital-badge-danger">
              {errorMessage}
            </span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ padding: "18px" }}
        >
          {/* BLOOD GROUP + UNITS */}
          <div className="hospital-filter-bar">
            <div style={{ flex: "1 1 220px" }}>
              <label
                htmlFor="blood_group"
                style={{
                  display: "block",
                  marginBottom: "7px",
                  color: "#2d2525",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Blood Group <span>*</span>
              </label>

              <select
                id="blood_group"
                name="blood_group"
                className="hospital-select"
                value={formData.blood_group}
                onChange={handleChange}
                disabled={submitting}
                required
              >
                <option value="">Select blood group</option>

                {BLOOD_GROUPS.map((bloodGroup) => (
                  <option key={bloodGroup} value={bloodGroup}>
                    {bloodGroup}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: "1 1 220px" }}>
              <label
                htmlFor="units_required"
                style={{
                  display: "block",
                  marginBottom: "7px",
                  color: "#2d2525",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Units Required <span>*</span>
              </label>

              <input
                id="units_required"
                name="units_required"
                type="number"
                min="1"
                step="1"
                className="hospital-input"
                placeholder="Enter number of units"
                value={formData.units_required}
                onChange={handleChange}
                disabled={submitting}
                required
              />
            </div>
          </div>

          {/* URGENCY */}
          <div style={{ marginTop: "18px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "7px",
                color: "#2d2525",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Urgency <span>*</span>
            </label>

            <div className="hospital-filter-bar">
              {URGENCY_OPTIONS.map((option) => {
                const selected =
                  formData.urgency === option.value;

                return (
                  <label
                    key={option.value}
                    className="hospital-action-button"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      minHeight: "40px",
                      flex: "1 1 220px",
                      cursor: submitting
                        ? "not-allowed"
                        : "pointer",
                      background: selected
                        ? "#e8c9c7"
                        : "#fffdfc",
                      borderColor: selected
                        ? "#b97878"
                        : "#e6d8d5",
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={option.value}
                      checked={selected}
                      onChange={handleChange}
                      disabled={submitting}
                    />

                    <span>
                      <strong
                        style={{
                          display: "block",
                          color: "#2d2525",
                          fontSize: "12px",
                        }}
                      >
                        {option.label}
                      </strong>

                      <small
                        style={{
                          display: "block",
                          marginTop: "3px",
                          color: "#756868",
                          fontSize: "10px",
                          fontWeight: 400,
                        }}
                      >
                        {option.description}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* REQUIRED DATE */}
          <div style={{ marginTop: "18px" }}>
            <label
              htmlFor="required_by"
              style={{
                display: "block",
                marginBottom: "7px",
                color: "#2d2525",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Required Date &amp; Time
            </label>

            <input
              id="required_by"
              name="required_by"
              type="datetime-local"
              className="hospital-input"
              value={formData.required_by}
              onChange={handleChange}
              disabled={submitting}
            />

            <small
              style={{
                display: "block",
                marginTop: "6px",
                color: "#756868",
                fontSize: "10px",
              }}
            >
              Leave this empty if the requirement does not have a
              specific deadline.
            </small>
          </div>

          {/* NOTES */}
          <div style={{ marginTop: "18px" }}>
            <label
              htmlFor="hospital_notes"
              style={{
                display: "block",
                marginBottom: "7px",
                color: "#2d2525",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              Description / Additional Notes
            </label>

            <textarea
              id="hospital_notes"
              name="hospital_notes"
              className="hospital-input"
              rows="6"
              maxLength="2000"
              placeholder="Add relevant information about this blood requirement..."
              value={formData.hospital_notes}
              onChange={handleChange}
              disabled={submitting}
              style={{
                paddingTop: "11px",
                resize: "vertical",
              }}
            />

            <small
              style={{
                display: "block",
                marginTop: "6px",
                color: "#756868",
                fontSize: "10px",
                textAlign: "right",
              }}
            >
              {formData.hospital_notes.length}/2000 characters
            </small>
          </div>

          {/* SUMMARY */}
          <div style={{ marginTop: "24px" }}>
            <div className="hospital-card-header">
              <div>
                <h3>Request Summary</h3>
                <p>Review the request before submitting.</p>
              </div>
            </div>

            <div className="hospital-kpi-grid">
              <div className="hospital-kpi-card">
                <div>
                  <p className="hospital-kpi-label">
                    Blood Group
                  </p>

                  <strong className="hospital-kpi-value">
                    {formData.blood_group || "—"}
                  </strong>
                </div>
              </div>

              <div className="hospital-kpi-card">
                <div>
                  <p className="hospital-kpi-label">
                    Units Required
                  </p>

                  <strong className="hospital-kpi-value">
                    {formData.units_required || "—"}
                  </strong>
                </div>
              </div>

              <div className="hospital-kpi-card">
                <div>
                  <p className="hospital-kpi-label">
                    Urgency
                  </p>

                  <strong className="hospital-kpi-value">
                    {formData.urgency
                      ? formData.urgency
                          .charAt(0)
                          .toUpperCase() +
                        formData.urgency.slice(1)
                      : "Normal"}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div
            className="hospital-page-actions"
            style={{
              justifyContent: "flex-end",
              marginTop: "24px",
            }}
          >
            <button
              type="button"
              className="hospital-secondary-button"
              onClick={() => navigate("/requests")}
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="hospital-primary-button"
              disabled={submitting}
            >
              {submitting
                ? "Creating Request..."
                : "Create Blood Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateBloodRequest;