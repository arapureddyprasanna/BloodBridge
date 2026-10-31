import { API_BASE_URL } from "../../api";
import { useCallback, useEffect, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import ProfilePictureUpload from "../../components/ProfilePictureUpload";
import "../admin/Settings.css";

const API_URL = `${API_BASE_URL}/auth/me/`;

function HospitalProfile() {
  const [profile, setProfile] = useState(null);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    latitude: "",
    longitude: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const getToken = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("You are not authenticated.");
    }

    return currentUser.getIdToken();
  };

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      const token = await getToken();

      const response = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail || data?.message || "Unable to load profile."
        );
      }

      setProfile(data);

      setFormData({
        full_name: data.full_name || "",
        phone: data.phone || data.mobile_number || "",
        latitude: data.hospital_profile?.latitude ?? "",
        longitude: data.hospital_profile?.longitude ?? "",
      });
    } catch (error) {
      console.error("Hospital profile loading failed:", error);
      showToast(error.message || "Unable to load profile.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSaveClick = (event) => {
    event.preventDefault();
    setShowSaveModal(true);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);

      const token = await getToken();

      const response = await fetch(API_URL, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim(),
          latitude: formData.latitude === "" ? null : formData.latitude,
          longitude: formData.longitude === "" ? null : formData.longitude,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail || data?.message || "Unable to update profile."
        );
      }

      setProfile(data);

      setFormData({
        full_name: data.full_name || "",
        phone: data.phone || data.mobile_number || "",
        latitude: data.hospital_profile?.latitude ?? "",
        longitude: data.hospital_profile?.longitude ?? "",
      });

      setShowSaveModal(false);

      showToast("Profile updated successfully.", "success");
    } catch (error) {
      console.error("Hospital profile update failed:", error);
      showToast(error.message || "Unable to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!profile) {
      return;
    }

    setFormData({
      full_name: profile.full_name || "",
      phone: profile.phone || profile.mobile_number || "",
      latitude: profile.hospital_profile?.latitude ?? "",
      longitude: profile.hospital_profile?.longitude ?? "",
    });
  };

  const getInitials = () => {
    const name = profile?.full_name?.trim();

    if (!name) {
      return "HA";
    }

    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  };

  if (loading) {
    return (
      <div className="bb-settings-page">
        <div className="bb-settings-heading">
          <div>
            <div className="bb-settings-breadcrumb">
              <span>Hospital</span>
              <span>/</span>
              Profile
            </div>

            <h1>Hospital Profile</h1>

            <p>
              Manage your hospital administrator profile
              information.
            </p>
          </div>
        </div>

        <div className="bb-settings-content">
          <section className="bb-settings-card">
            <div className="bb-settings-card-heading">
              <div className="bb-settings-section-icon">◎</div>

              <div>
                <h2>Loading Profile</h2>

                <p>
                  Please wait while we load your account
                  information.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bb-settings-page">
        <div className="bb-settings-heading">
          <div>
            <div className="bb-settings-breadcrumb">
              <span>Hospital</span>
              <span>/</span>
              Profile
            </div>

            <h1>Hospital Profile</h1>

            <p>
              Manage your hospital administrator profile
              information.
            </p>
          </div>
        </div>

        <div className="bb-settings-content">
          <section className="bb-settings-card">
            <div className="bb-settings-card-heading">
              <div className="bb-settings-section-icon">!</div>

              <div>
                <h2>Unable to Load Profile</h2>

                <p>
                  Please refresh the page and try again.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const profilePicture = profile.profile_picture;

  const roleLabel =
    profile.role === "hospital_admin"
      ? "Hospital Administrator"
      : profile.role || "Hospital Admin";

  const isActive = profile.status === "active";

  return (
    <div className="bb-settings-page">
      <div className="bb-settings-heading">
        <div>
          <div className="bb-settings-breadcrumb">
            <span>Hospital</span>
            <span>/</span>
            Profile
          </div>

          <h1>Hospital Profile</h1>

          <p>
            Manage your hospital administrator profile
            information.
          </p>
        </div>

        <div className="bb-settings-status">
          <span />
          {isActive ? "Account Active" : "Account Status"}
        </div>
      </div>

      <div className="bb-settings-content">
        <section className="bb-settings-card">
          <div className="bb-settings-card-heading">
            <div className="bb-settings-section-icon">◎</div>

            <div>
              <h2>Profile Information</h2>

              <p>
                Manage the information associated with your
                hospital administrator account.
              </p>
            </div>
          </div>

          <div className="bb-settings-account">
            <div className="bb-settings-account-avatar">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt={profile.full_name || "Hospital Admin"}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                getInitials()
              )}
            </div>

            <div className="bb-settings-account-copy">
              <strong>
                {profile.full_name || "Hospital Admin"}
              </strong>

              <span>{profile.email || "No email available"}</span>

              <span className="bb-settings-role">
                {roleLabel}
              </span>
            </div>

            {profile.email_verified && (
              <span className="bb-settings-auth-badge">
                ✓ Verified
              </span>
            )}
          </div>

          <div className="bb-settings-divider" />
          <ProfilePictureUpload picture={profilePicture} name={profile.full_name || profile.email} onUpdated={(data) => setProfile((current) => ({ ...current, ...data }))} />
        </section>

        <section className="bb-settings-card">
          <div className="bb-settings-card-heading">
            <div className="bb-settings-section-icon">✎</div>

            <div>
              <h2>Personal Information</h2>

              <p>
                Update the personal information used for your
                hospital administrator account.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveClick}>
            <div className="bb-settings-form-grid">
              <div className="bb-settings-field">
                <label htmlFor="hospital-profile-full-name">
                  Full Name
                </label>

                <input
                  id="hospital-profile-full-name"
                  name="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div className="bb-settings-field">
                <label htmlFor="hospital-profile-phone">
                  Mobile Number
                </label>

                <input
                  id="hospital-profile-phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Enter your mobile number"
                />
              </div>
            </div>

            {profile.role === "hospital_admin" && (
              <>
                <div className="bb-settings-divider" />
                <div className="bb-settings-card-heading">
                  <div>
                    <h2>Hospital location for donor matching</h2>
                    <p>Matching requires coordinates to calculate donor distance and travel limits.</p>
                  </div>
                </div>
                <div className="bb-settings-form-grid">
                  <div className="bb-settings-field">
                    <label htmlFor="hospital-profile-latitude">Latitude</label>
                    <input id="hospital-profile-latitude" name="latitude" type="number" step="any" min="-90" max="90" value={formData.latitude} onChange={handleChange} placeholder="12.9716" />
                  </div>
                  <div className="bb-settings-field">
                    <label htmlFor="hospital-profile-longitude">Longitude</label>
                    <input id="hospital-profile-longitude" name="longitude" type="number" step="any" min="-180" max="180" value={formData.longitude} onChange={handleChange} placeholder="77.5946" />
                  </div>
                </div>
              </>
            )}

            <div className="bb-settings-divider" />

            <div className="bb-settings-field">
              <label htmlFor="hospital-profile-email">
                Email Address
              </label>

              <input
                id="hospital-profile-email"
                type="email"
                value={profile.email || ""}
                disabled
                readOnly
              />

              <span className="bb-settings-field-hint">
                Your email address is managed through your
                authenticated account and cannot be changed
                here.
              </span>
            </div>

            <div className="bb-settings-divider" />

            <div className="bb-settings-form-grid">
              <div className="bb-settings-field">
                <label htmlFor="hospital-profile-role">
                  Account Role
                </label>

                <input
                  id="hospital-profile-role"
                  type="text"
                  value={roleLabel}
                  disabled
                  readOnly
                />
              </div>

              <div className="bb-settings-field">
                <label>Account Status</label>

                <div className="bb-settings-account">
                  <div className="bb-settings-account-copy">
                    <strong>
                      {profile.status || "Unknown"}
                    </strong>

                    <span>
                      {isActive
                        ? "Your hospital account is currently active."
                        : "Your account status requires attention."}
                    </span>
                  </div>

                  {isActive && (
                    <span className="bb-settings-auth-badge">
                      Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bb-settings-actions">
              <span>
                Changes are applied only after confirmation.
              </span>

              <div>
                <button
                  type="button"
                  className="bb-settings-reset"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Reset
                </button>

                <button
                  type="submit"
                  className="bb-settings-save"
                  disabled={saving}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="bb-settings-card">
          <div className="bb-settings-card-heading">
            <div className="bb-settings-section-icon">✓</div>

            <div>
              <h2>Account Verification</h2>

              <p>
                Review the authentication and verification
                status of your hospital administrator account.
              </p>
            </div>
          </div>

          <div className="bb-settings-toggle-row">
            <div className="bb-settings-toggle-copy">
              <strong>Email Verification</strong>

              <span>
                {profile.email_verified
                  ? "Your email address has been verified."
                  : "Your email address has not been verified yet."}
              </span>
            </div>

            <span className="bb-settings-auth-badge">
              {profile.email_verified
                ? "Verified"
                : "Not Verified"}
            </span>
          </div>

          <div className="bb-settings-toggle-row">
            <div className="bb-settings-toggle-copy">
              <strong>Hospital Account</strong>

              <span>
                {isActive
                  ? "Your hospital administrator account is active and approved."
                  : `Current account status: ${
                      profile.status || "Unknown"
                    }.`}
              </span>
            </div>

            <span className="bb-settings-auth-badge">
              {isActive ? "Active" : profile.status || "Unknown"}
            </span>
          </div>
        </section>
      </div>

      {showSaveModal && (
        <div
          className="bb-settings-page"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgb(45 37 37 / 45%)",
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowSaveModal(false);
            }
          }}
        >
          <div
            className="bb-settings-card"
            style={{
              width: "min(100%, 460px)",
              margin: 0,
              boxShadow: "0 18px 45px rgb(45 37 37 / 18%)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hospital-profile-save-title"
          >
            <div className="bb-settings-card-heading">
              <div className="bb-settings-section-icon">?</div>

              <div>
                <h2 id="hospital-profile-save-title">
                  Save Profile Changes?
                </h2>

                <p>
                  Your hospital administrator profile
                  information will be updated.
                </p>
              </div>
            </div>

            <div className="bb-settings-actions">
              <span>
                Please confirm before applying these changes.
              </span>

              <div>
                <button
                  type="button"
                  className="bb-settings-reset"
                  onClick={() => setShowSaveModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="bb-settings-save"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HospitalProfile;
