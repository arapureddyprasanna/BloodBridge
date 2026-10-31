import { API_BASE_URL } from "../../api";
import { useEffect, useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import {
  EmptyState,
  LoadingState,
  PageHeader,
  PrivacyNoticeBox,
  CommunityCard,
  formatDate,
} from "./DonorComponents";
import "./DonorWorkspace.css";

export default function DonorAvailability() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        setLoading(true);
        const user = auth.currentUser;

        if (!user) {
          setProfile(null);
          return;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE_URL}/auth/me/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Unable to load donor availability settings.");
        }

        const data = await response.json();
        if (!mounted) return;

        setProfile({
          is_available: data?.donor_profile?.is_available ?? true,
          availability_start: data?.donor_profile?.availability_start,
          availability_end: data?.donor_profile?.availability_end,
          preferred_start_time: data?.donor_profile?.preferred_start_time,
          preferred_end_time: data?.donor_profile?.preferred_end_time,
          timezone: data?.donor_profile?.timezone || "Asia/Kolkata",
          max_travel_distance_km: data?.donor_profile?.max_travel_distance_km || 25,
        });
      } catch (error) {
        console.error("Donor availability load failed:", error);
        showToast(error.message || "Unable to load donor availability.", "error");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingState message="Loading availability settings..." />;
  }

  if (!profile) {
    return (
      <div className="bb-page-shell">
        <PageHeader
          eyebrow="COMMUNITY"
          title="Availability"
          subtitle="Your availability data is not available right now."
        />
        <EmptyState
          title="Availability details unavailable"
          message="No donor availability profile is available from the backend yet."
          icon="◷"
        />
      </div>
    );
  }

  return (
    <div className="bb-page-shell">
      <PageHeader
        eyebrow="COMMUNITY"
        title="Availability"
        subtitle="Share your donation availability while keeping your exact location private."
      />

      <div className="bb-grid bb-grid--two">
        <CommunityCard title="Status" value={profile.is_available ? "Available" : "Paused"} subtitle={profile.is_available ? "You are open to donation matches." : "You are currently paused from donation requests."} />
        <CommunityCard title="Travel radius" value={`${profile.max_travel_distance_km} km`} subtitle="Location is shared at city level only for matching." />
        <CommunityCard title="Window" value={profile.availability_start ? formatDate(profile.availability_start) : "Not set"} subtitle={profile.availability_end ? `Until ${formatDate(profile.availability_end)}` : "No end date configured."} />
        <CommunityCard title="Timezone" value={profile.timezone} subtitle={profile.preferred_start_time ? `Preferred time ${profile.preferred_start_time}` : "No preferred time set."} />
      </div>

      <PrivacyNoticeBox
        title="Availability privacy"
        description="Your exact address is never shared with hospitals. BloodBridge uses city-level and distance-based matching to keep your information protected while still enabling safe donor coordination."
      />
    </div>
  );
}
