import { API_BASE_URL } from "../../api";

import { useEffect, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import ProfilePictureUpload from "../../components/ProfilePictureUpload";
import "./Settings.css";

const API_URL = `${API_BASE_URL}/auth/me/`;

function AdminProfile() {
    const [profile, setProfile] = useState(null);
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);


    useEffect(() => {
        let mounted = true;

        async function loadProfile() {
            try {
                const user = auth.currentUser;
                if (!user) throw new Error("Please sign in again.");

                const token = await user.getIdToken();
                const response = await fetch(API_URL, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || "Unable to load profile.");
                }

                if (mounted) {
                    setProfile(data);
                    setFullName(data.full_name || "");
                    setPhone(data.phone || "");
                }
            } catch (error) {
                if (mounted) {
                    showToast(error.message || "Unable to load profile.");
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadProfile();

        return () => {
            mounted = false;
        };
    }, []);

    async function getToken() {
        const user = auth.currentUser;
        if (!user) throw new Error("Please sign in again.");
        return user.getIdToken();
    }

    async function handleSave(event) {
        event.preventDefault();

        if (!fullName.trim() || !phone.trim()) {
            showToast("Please complete your name and phone number.");
            return;
        }

        setSaving(true);

        try {
            const token = await getToken();
            const response = await fetch(API_URL, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    full_name: fullName.trim(),
                    phone: phone.trim(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Unable to save profile.");
            }

            setProfile((previous) => ({ ...previous, ...data }));
            setFullName(data.full_name || "");
            setPhone(data.phone || "");
            setShowSaveModal(false);
            showToast("Profile updated successfully!");
        } catch (error) {
            showToast(error.message || "Unable to save profile.");
        } finally {
            setSaving(false);
        }
    }

    function handleCancel() {
        setFullName(profile?.full_name || "");
        setPhone(profile?.phone || "");
    }

    if (loading) {
        return (
            <div className="bb-settings-page">
                <p>Loading your profile...</p>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="bb-settings-page">
                <h1>My Profile</h1>
                <p>Unable to load your profile. Please sign in again and retry.</p>
            </div>
        );
    }

    const initials = (profile.full_name || profile.email || "SA")
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();

    const displayedPhoto = profile.profile_picture;

    return (
        <div className="bb-settings-page">
            <div className="bb-settings-heading">
                <div>
                    <div className="bb-settings-breadcrumb">
                        Administration <span>/</span> My Profile
                    </div>
                    <h1>My Profile</h1>
                    <p>Manage your personal information and account details.</p>
                </div>

                <div className="bb-settings-status">
                    <span />
                    {profile.status || "Account"}
                </div>
            </div>

            <div className="bb-settings-content">
                <section className="bb-settings-card">
                    <div className="bb-settings-card-heading">
                        <div className="bb-settings-section-icon">♙</div>
                        <div>
                            <h2>Profile Overview</h2>
                            <p>Your BloodBridge administrator account.</p>
                        </div>
                    </div>

                    <div className="bb-settings-account">
                        <div
                            className="bb-settings-account-avatar"
                            style={{
                                overflow: "hidden",
                                padding: 0,
                                display: "grid",
                                placeItems: "center",
                            }}
                        >
                            {displayedPhoto ? (
                                <img
                                    src={displayedPhoto}
                                    alt="Profile"
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        borderRadius: "inherit",
                                    }}
                                />
                            ) : (
                                initials
                            )}
                        </div>

                        <div className="bb-settings-account-copy">
                            <strong>{profile.full_name || "Super Admin"}</strong>
                            <span>{profile.email}</span>
                            <span className="bb-settings-role">
                                {String(profile.role || "Super Admin").replaceAll("_", " ")}
                            </span>
                        </div>

                        <span className="bb-settings-auth-badge">
                            {profile.email_verified ? "Email verified" : "Email unverified"}
                        </span>
                    </div>

                    <ProfilePictureUpload picture={profile.profile_picture} name={profile.full_name || profile.email} onUpdated={(data) => setProfile((current) => ({ ...current, ...data }))} />
                </section>

                <section className="bb-settings-card">
                    <div className="bb-settings-card-heading">
                        <div className="bb-settings-section-icon">✎</div>
                        <div>
                            <h2>Personal Information</h2>
                            <p>Update the details associated with your account.</p>
                        </div>
                    </div>

                    <form
                        onSubmit={(event) => {
                            event.preventDefault();

                            if (!fullName.trim() || !phone.trim()) {
                                showToast("Please complete your name and phone number.");
                                return;
                            }

                            setShowSaveModal(true);
                        }}
                    >
                        <div className="bb-settings-form-grid">
                            <div className="bb-settings-field">
                                <label htmlFor="profile-name">Full name</label>
                                <input
                                    id="profile-name"
                                    type="text"
                                    value={fullName}
                                    onChange={(event) => setFullName(event.target.value)}
                                    placeholder="Enter your full name"
                                    maxLength={150}
                                    required
                                />
                            </div>

                            <div className="bb-settings-field">
                                <label htmlFor="profile-phone">Phone number</label>
                                <input
                                    id="profile-phone"
                                    type="tel"
                                    value={phone}
                                    onChange={(event) => setPhone(event.target.value)}
                                    placeholder="Enter your phone number"
                                    maxLength={20}
                                    required
                                />
                            </div>

                            <div className="bb-settings-field">
                                <label htmlFor="profile-email">Email address</label>
                                <input
                                    id="profile-email"
                                    type="email"
                                    value={profile.email || ""}
                                    readOnly
                                />
                                <p>Email is managed through your account authentication.</p>
                            </div>

                            <div className="bb-settings-field">
                                <label htmlFor="profile-role">Account role</label>
                                <input
                                    id="profile-role"
                                    type="text"
                                    value={String(profile.role || "").replaceAll("_", " ")}
                                    readOnly
                                />
                                <p>Your role cannot be changed from this page.</p>
                            </div>
                        </div>

                        <div className="bb-settings-divider" />

                        <div className="bb-settings-actions">
                            <span>Only your name and phone number can be updated here.</span>
                            <div>
                                <button
                                    className="bb-settings-reset"
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="bb-settings-save"
                                    type="submit"
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
                        <div className="bb-settings-section-icon">♧</div>
                        <div>
                            <h2>Account Security</h2>
                            <p>Your account verification and access information.</p>
                        </div>
                    </div>

                    <div className="bb-settings-info-row">
                        <span>Email verification</span>
                        <strong>
                            {profile.email_verified ? "Verified" : "Not verified"}
                        </strong>
                    </div>

                    <div className="bb-settings-info-row">
                        <span>Account status</span>
                        <strong>{profile.status || "Unavailable"}</strong>
                    </div>

                    <div className="bb-settings-security-note">
                        <span>i</span>
                        <p>
                            Your email, administrator role, and account status are
                            read-only here. Authentication is managed by Firebase.
                        </p>
                    </div>
                </section>
            </div>

            {showSaveModal && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 9999,
                        display: "grid",
                        placeItems: "center",
                        padding: "20px",
                        background: "rgba(35, 20, 22, 0.45)",
                        backdropFilter: "blur(5px)",
                    }}
                    onClick={() => !saving && setShowSaveModal(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="profile-save-title"
                        style={{
                            width: "100%",
                            maxWidth: "440px",
                            padding: "28px",
                            border: "1px solid #e6d8d5",
                            borderRadius: "16px",
                            background: "#fffdfc",
                            boxShadow: "0 20px 60px rgba(45, 25, 25, 0.2)",
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            style={{
                                width: "46px",
                                height: "46px",
                                display: "grid",
                                placeItems: "center",
                                borderRadius: "12px",
                                background: "#f9eae8",
                                color: "#7a1f2b",
                                fontSize: "23px",
                                marginBottom: "18px",
                            }}
                        >
                            ✓
                        </div>

                        <h2
                            id="profile-save-title"
                            style={{
                                margin: "0 0 10px",
                                color: "#2d2525",
                                fontSize: "20px",
                            }}
                        >
                            Save profile changes?
                        </h2>

                        <p
                            style={{
                                margin: "0 0 24px",
                                color: "#756868",
                                lineHeight: 1.7,
                            }}
                        >
                            Are you sure you want to update your personal information?
                            Your changes will be saved to your BloodBridge account.
                        </p>

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "10px",
                            }}
                        >
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
                                disabled={saving}
                                onClick={handleSave}
                            >
                                {saving ? "Saving..." : "Confirm & Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminProfile;
