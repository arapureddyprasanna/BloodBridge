import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../api";
import ProfilePictureUpload from "../../components/ProfilePictureUpload";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import { EmptyState, LoadingState, PageHeader } from "./DonorComponents";
import "./DonorWorkspace.css";

export default function DonorProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "" });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const response = await fetch(`${API_BASE_URL}/auth/me/`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to load your profile.");
      setProfile(data);
      setForm({ full_name: data.full_name || "", phone: data.phone || "" });
    } catch (error) {
      showToast(error.message || "Unable to load your profile.", "error");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const response = await fetch(`${API_BASE_URL}/auth/me/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: form.full_name.trim(), phone: form.phone.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to update your profile.");
      setProfile((current) => ({ ...current, ...data }));
      setForm({ full_name: data.full_name || "", phone: data.phone || "" });
      window.dispatchEvent(new CustomEvent("bloodbridge-profile-updated", { detail: { full_name: data.full_name } }));
      showToast("Profile updated successfully.", "success");
    } catch (error) {
      showToast(error.message || "Unable to update your profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading your profile…" />;
  if (!profile) return <EmptyState title="Profile unavailable" message="We could not load your profile. Please refresh and try again." onAction={loadProfile} actionLabel="Retry" />;

  const donor = profile.donor_profile || {};

  return <div className="bb-page-shell bb-donor-profile">
    <PageHeader eyebrow="DONOR WORKSPACE" title="My Profile" subtitle="Keep your donor account information current." />
    <section className="bb-card bb-donor-profile-card">
      <div className="bb-section-header"><div className="bb-section-heading"><span className="bb-card-eyebrow">ACCOUNT</span><h2 className="bb-card-title">Profile picture</h2></div></div>
      <ProfilePictureUpload picture={profile.profile_picture} name={profile.full_name || profile.email} onUpdated={(data) => setProfile((current) => ({ ...current, ...data }))} />
    </section>
    <section className="bb-card bb-donor-profile-card">
      <div className="bb-section-header"><div className="bb-section-heading"><span className="bb-card-eyebrow">PERSONAL INFORMATION</span><h2 className="bb-card-title">Donor details</h2></div></div>
      <form className="bb-donor-profile-form" onSubmit={saveProfile}>
        <label>Full name<input required maxLength={150} value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} /></label>
        <label>Phone number<input required maxLength={20} type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label>Email<input type="email" value={profile.email || ""} readOnly /></label>
        <label>Blood group<input value={profile.blood_group || donor.blood_group || "Not set"} readOnly /></label>
        <label>Account status<input value={profile.status || "Unknown"} readOnly /></label>
        <label>Availability<input value={donor.is_available === false ? "Paused" : "Available"} readOnly /></label>
        <div className="bb-donor-profile-actions"><button className="bb-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
      </form>
    </section>
  </div>;
}
