import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../api";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import { CommunityCard, EmptyState, LoadingState, PageHeader, PrivacyNoticeBox, StatusBadge, formatDate, formatDateTime } from "./DonorComponents";
import "./DonorWorkspace.css";

async function communityApi(path, { method = "GET", body } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "The request could not be completed.");
  return data;
}

export default function DonorCommunity() {
  const [membership, setMembership] = useState(null);
  const [community, setCommunity] = useState(null);
  const [reviews, setReviews] = useState({ rating: 0, count: 0, results: [], my_review: null });
  const [announcements, setAnnouncements] = useState([]);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadCommunity = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const applicationData = await communityApi("/communities/my-application/");
      const application = applicationData.application || null;
      setMembership(application);
      if (!application?.community) { setCommunity(null); setReviews({ rating: 0, count: 0, results: [], my_review: null }); setAnnouncements([]); return; }
      const [communityData, reviewData, announcementData] = await Promise.all([
        communityApi(`/communities/${application.community}/`),
        communityApi(`/communities/${application.community}/reviews/`),
        application.status === "accepted" ? communityApi(`/communities/${application.community}/announcements/`) : Promise.resolve({ results: [] }),
      ]);
      setCommunity(communityData);
      setReviews({ rating: Number(reviewData.rating) || 0, count: Number(reviewData.count) || 0, results: reviewData.results || [], my_review: reviewData.my_review || null });
      setAnnouncements(announcementData.results || []);
      if (reviewData.my_review) { setRating(reviewData.my_review.rating); setReviewText(reviewData.my_review.review || ""); }
      else { setRating(5); setReviewText(""); setEditing(false); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  const saveReview = async (event) => {
    event.preventDefault();
    if (!membership?.community || membership.status !== "accepted") return;
    setSaving(true); setError("");
    try {
      const method = reviews.my_review ? "PATCH" : "POST";
      await communityApi(`/communities/${membership.community}/reviews/`, { method, body: { rating, review: reviewText.trim() } });
      showToast(reviews.my_review ? "Your community review was updated." : "Your community review was submitted.");
      setEditing(false);
      await loadCommunity();
    } catch (err) { setError(err.message); showToast(err.message, "error"); }
    finally { setSaving(false); }
  };

  const deleteReview = async () => {
    if (!membership?.community || !window.confirm("Delete your community review?")) return;
    setSaving(true); setError("");
    try {
      await communityApi(`/communities/${membership.community}/reviews/`, { method: "DELETE" });
      showToast("Your community review was deleted.");
      setEditing(false);
      await loadCommunity();
    } catch (err) { setError(err.message); showToast(err.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState message="Loading your community…" />;

  return <div className="bb-page-shell">
    <PageHeader eyebrow="COMMUNITY" title="My Community" subtitle="Stay connected with your community, share feedback, and read member updates." />
    {error && <div className="bb-donor-error" role="alert">{error}<button type="button" className="bb-secondary-button" onClick={loadCommunity}>Retry</button></div>}
    {!membership?.community || !community ? <EmptyState title="Community details unavailable" message={membership?.status === "pending" ? "Your membership request is awaiting community review." : "A community profile is not connected to your donor account yet."} icon="♧" onAction={loadCommunity} actionLabel="Refresh" /> : <>
      <section className="bb-card bb-donor-community-hero"><div className="bb-donor-community-heading"><div>{community.logo && <img className="bb-donor-community-logo" src={community.logo} alt="" />}<div><p className="bb-card-eyebrow">YOUR DONOR COMMUNITY</p><h2>{community.name}</h2><p>{[community.city, community.state].filter(Boolean).join(", ") || "Location not provided"}</p></div></div><StatusBadge status={membership.status} /></div><p className="bb-donor-community-description">{community.description || "Your verified BloodBridge community supports local donor coordination."}</p><div className="bb-grid bb-grid--three"><CommunityCard title="Membership" value={membership.status === "accepted" ? "Active member" : membership.status} subtitle={membership.reviewed_at ? `Reviewed ${formatDate(membership.reviewed_at)}` : `Requested ${formatDate(membership.submitted_at)}`} /><CommunityCard title="Community rating" value={`${reviews.rating.toFixed(1)} / 5`} subtitle={`${reviews.count} member reviews`} /><CommunityCard title="Community location" value={community.city || "Not provided"} subtitle={community.state || "Location not provided"} /></div></section>
      <PrivacyNoticeBox title="Privacy protection" description="Your exact donor coordinates and private profile fields are not shown in this community view. Availability is shared with community admins only when you have enabled community visibility." />
      {membership.status === "accepted" && <section className="bb-card bb-donor-review-section"><div className="bb-section-header"><div className="bb-section-heading"><span className="bb-card-eyebrow">MEMBER FEEDBACK</span><h2 className="bb-section-title">Community reviews</h2><p className="bb-section-description">Only active, accepted members can submit one review for this community.</p></div><div className="bb-donor-review-summary"><strong>{reviews.rating.toFixed(1)}</strong><span>{"★".repeat(Math.round(reviews.rating))}{"☆".repeat(5 - Math.round(reviews.rating))}</span><small>{reviews.count} {reviews.count === 1 ? "review" : "reviews"}</small></div></div>
        {reviews.my_review && !editing ? <article className="bb-donor-own-review"><div><strong>Your review</strong><span className="bb-donor-review-stars">{"★".repeat(reviews.my_review.rating)}{"☆".repeat(5 - reviews.my_review.rating)}</span></div><p>{reviews.my_review.review || "You left a rating without a written comment."}</p><small>Updated {formatDateTime(reviews.my_review.updated_at)}</small><div className="bb-page-actions"><button type="button" className="bb-secondary-button" disabled={saving} onClick={() => { setRating(reviews.my_review.rating); setReviewText(reviews.my_review.review || ""); setEditing(true); }}>Edit review</button><button type="button" className="bb-secondary-button bb-donor-danger-button" disabled={saving} onClick={deleteReview}>Delete review</button></div></article> : <form className="bb-donor-review-form" onSubmit={saveReview}><fieldset disabled={saving}><legend>{reviews.my_review ? "Edit your review" : "Rate your community"}</legend><div className="bb-donor-rating-picker" role="group" aria-label="Community rating from one to five stars">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={value <= rating ? "is-selected" : ""} type="button" aria-label={`${value} ${value === 1 ? "star" : "stars"}`} aria-pressed={rating === value} onClick={() => setRating(value)}>★</button>)}</div><label>Written review <span className="bb-donor-optional-label">(optional)</span><textarea rows="4" maxLength="2000" value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Share what you value about your community." /></label><div className="bb-donor-review-form-footer"><small>{reviewText.length}/2000 characters</small><div className="bb-page-actions">{reviews.my_review && <button type="button" className="bb-secondary-button" onClick={() => setEditing(false)}>Cancel</button>}<button type="submit" className="bb-primary-button">{saving ? "Saving…" : reviews.my_review ? "Save changes" : "Submit review"}</button></div></div></fieldset></form>}
        <div className="bb-donor-review-list"><h3>Member reviews</h3>{reviews.results.length ? reviews.results.map((review) => <article className="bb-donor-review-item" key={review.id}><header><strong>{review.donor_name || "Community member"}</strong><span className="bb-donor-review-stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></header><small>{formatDate(review.created_at)}</small><p>{review.review || "Rating only"}</p></article>) : <EmptyState title="No reviews yet" message="Your review can be the first feedback shared with this community." icon="★" />}</div>
      </section>}
      {membership.status === "accepted" && <section className="bb-card bb-donor-announcements"><div className="bb-section-header"><div className="bb-section-heading"><span className="bb-card-eyebrow">COMMUNITY UPDATES</span><h2 className="bb-section-title">Announcements</h2><p className="bb-section-description">Published updates shared with accepted community members.</p></div></div>{announcements.length ? announcements.map((announcement) => <article className="bb-donor-announcement" key={announcement.id}><header><h3>{announcement.title}</h3>{announcement.is_pinned && <StatusBadge status="pinned" />}</header><small>{formatDate(announcement.publication_date || announcement.published_at)}</small><p>{announcement.message}</p></article>) : <EmptyState title="No community announcements" message="Published community updates will appear here." icon="▤" />}</section>}
    </>}
  </div>;
}
