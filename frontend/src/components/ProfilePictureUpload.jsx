import { useEffect, useId, useState } from "react";
import { API_BASE_URL } from "../api";
import { auth } from "../firebase";
import { showToast } from "../App";

const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePictureUpload({ picture, name, onUpdated }) {
  const inputId = useId();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const initials = (name || auth.currentUser?.displayName || auth.currentUser?.email || "BB")
    .trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  const selectFile = (event) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!TYPES.includes(selected.type)) {
      showToast("Choose a JPG, PNG, or WebP image.", "error");
      return;
    }
    if (selected.size > MAX_SIZE) {
      showToast("Image must be 5 MB or smaller.", "error");
      return;
    }
    setFile(selected);
  };

  const savePicture = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const body = new FormData();
      body.append("photo", file);
      const response = await fetch(`${API_BASE_URL}/auth/me/photo/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to upload profile picture.");
      setFile(null);
      onUpdated?.(data);
      window.dispatchEvent(new CustomEvent("bloodbridge-profile-updated", {
        detail: { profile_picture: data.profile_picture || "", full_name: data.full_name },
      }));
      showToast("Profile picture updated successfully.", "success");
    } catch (error) {
      showToast(error.message || "Unable to upload profile picture.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removePicture = async () => {
    if (!picture || busy) return;
    if (!window.confirm("Remove your current profile picture?")) return;
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const response = await fetch(`${API_BASE_URL}/auth/me/photo/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to remove profile picture.");
      onUpdated?.(data);
      window.dispatchEvent(new CustomEvent("bloodbridge-profile-updated", {
        detail: { profile_picture: "", full_name: data.full_name },
      }));
      showToast("Profile picture removed.", "success");
    } catch (error) {
      showToast(error.message || "Unable to remove profile picture.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bb-profile-picture-card">
      <div className="bb-profile-picture-preview" aria-label="Profile picture preview">
        {preview || picture ? <img src={preview || picture} alt="" /> : <span>{initials}</span>}
      </div>
      <div className="bb-profile-picture-info">
        <strong>Profile picture</strong>
        <p>JPG, PNG, or WebP · Maximum 5 MB.</p>
        <input id={inputId} className="bb-profile-picture-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={busy} />
        <div className="bb-profile-picture-actions">
          <label className="bb-profile-picture-button bb-profile-picture-button--secondary" htmlFor={inputId}>{file ? "Choose another" : "Select image"}</label>
          {file && <><button className="bb-profile-picture-button bb-profile-picture-button--primary" type="button" onClick={savePicture} disabled={busy}>{busy ? "Uploading…" : "Save picture"}</button><button className="bb-profile-picture-button bb-profile-picture-button--secondary" type="button" onClick={() => setFile(null)} disabled={busy}>Cancel</button></>}
          {!file && picture && <button className="bb-profile-picture-button bb-profile-picture-button--secondary" type="button" onClick={removePicture} disabled={busy}>{busy ? "Removing…" : "Remove"}</button>}
        </div>
        {file && <p className="bb-profile-picture-selected">Selected: {file.name}</p>}
      </div>
    </div>
  );
}
