import { API_BASE_URL as API_BASE } from "../../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { auth } from "../../firebase";
import { formatDate, formatDateTime, StatusBadge } from "../donor/DonorComponents";
import { showToast } from "../../App";
import ProfilePictureUpload from "../../components/ProfilePictureUpload";

async function api(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.blob();
  if (!response.ok) {
    const detail = data?.detail || (data && Object.values(data).flat().join(" ")) || "The request could not be completed.";
    throw new Error(detail);
  }
  return data;
}

function Page({ eyebrow, title, subtitle, action, children }) {
  return <div className="bb-community-page"><header className="bb-community-heading"><div><p className="bb-community-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>{children}</div>;
}

function Panel({ title, description, action, children }) {
  return <section className="bb-community-panel"><header className="bb-community-panel-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>;
}

function Loading({ label = "Loading community data…" }) { return <div className="bb-community-state" role="status">{label}</div>; }
function Empty({ title, children }) { return <div className="bb-community-empty"><span aria-hidden="true">♧</span><h3>{title}</h3><p>{children}</p></div>; }
function toLocalDateTimeInput(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const pad = (part) => String(part).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }

function useCommunityData() {
  const [community, setCommunity] = useState(null);
  const [applications, setApplications] = useState([]);
  const [members, setMembers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ rating: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [profileData, applicationData, memberData] = await Promise.all([
        api("/communities/my/"), api("/communities/my/applications/"), api("/communities/my/members/"),
      ]);
      const currentCommunity = profileData.community || profileData;
      setCommunity(currentCommunity.exists === false ? null : currentCommunity);
      setApplications(applicationData.results || []);
      setMembers(memberData.results || []);
      if (currentCommunity.id) {
        const reviewData = await api(`/communities/${currentCommunity.id}/reviews/`);
        setReviews(reviewData.results || []);
        setReviewSummary({ rating: reviewData.rating || 0, count: reviewData.count || 0 });
      } else { setReviews([]); setReviewSummary({ rating: 0, count: 0 }); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { community, applications, members, reviews, reviewSummary, loading, error, reload };
}

function ApplicationCard({ application, onChanged, detail = false }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const documents = application.documents || [];
  const allVerified = application.required_documents_complete && documents.every((doc) => doc.uploaded && doc.status === "verified");
  const updateDocument = async (document, status) => {
    let rejectionReason = "";
    if (status === "rejected") {
      rejectionReason = window.prompt(`Reason for rejecting ${document.label}:`, document.rejection_reason || "")?.trim() || "";
      if (!rejectionReason) return;
    }
    setBusy(true);
    try {
      await api(`/communities/my/applications/${application.id}/documents/${document.id}/`, { method: "PATCH", body: JSON.stringify({ status, rejection_reason: rejectionReason }) });
      showToast("Donor document updated."); await onChanged();
    } catch (err) { showToast(err.message, "error"); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    setBusy(true);
    try { await api(`/communities/my/applications/${application.id}/approve/`, { method: "POST", body: JSON.stringify({}) }); showToast("Membership approved."); await onChanged(); }
    catch (err) { showToast(err.message, "error"); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try { await api(`/communities/my/applications/${application.id}/reject/`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }); showToast("Membership request rejected."); await onChanged(); }
    catch (err) { showToast(err.message, "error"); }
    finally { setBusy(false); setRejecting(false); }
  };

  return <article className="bb-community-application-card"><div className="bb-community-applicant"><div className="bb-community-person-mark">{(application.donor_name || "D").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div><div className="bb-community-person-info"><h3>{application.donor_name || "Donor"}</h3><p>{application.donor_email || "Email not provided"}</p><p>{application.donor_phone || "Phone not provided"}</p></div><StatusBadge status={application.status} /></div>
    <div className="bb-community-applicant-meta"><span><strong>Blood group</strong>{application.blood_group || "Not provided"}</span><span><strong>Applied</strong>{formatDate(application.submitted_at)}</span><span><strong>Verification</strong>{String(application.verification_status || "not started").replaceAll("_", " ")}</span></div>
    {application.rejection_reason && <p className="bb-community-rejection-note">Previous decision: {application.rejection_reason}</p>}
    <div className="bb-community-documents"><h4>Required donor documents</h4>{documents.map((doc) => <div className="bb-community-document" key={doc.id || doc.type}><div className="bb-community-document-info"><strong>{doc.label}</strong><span>{doc.uploaded ? <StatusBadge status={doc.status} /> : <span className="bb-community-missing">Not uploaded</span>}</span>{doc.rejection_reason && <small>{doc.rejection_reason}</small>}</div><div className="bb-community-document-actions">{doc.uploaded && doc.id && <button className="bb-community-button bb-community-button--light" type="button" onClick={async () => { try { const blob = await api(`/communities/my/applications/${application.id}/documents/${doc.id}/download/`); const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = `${doc.type}-document`; anchor.click(); URL.revokeObjectURL(objectUrl); } catch (err) { showToast(err.message, "error"); } }}>Download document</button>}{application.status === "pending" && doc.uploaded && doc.id && <><button className="bb-community-button bb-community-button--light" type="button" disabled={busy || doc.status === "verified"} onClick={() => updateDocument(doc, "verified")}>Verify</button><button className="bb-community-button bb-community-button--danger" type="button" disabled={busy} onClick={() => updateDocument(doc, "rejected")}>Reject document</button></>}</div></div>)}</div>
    {application.status === "pending" && <div className="bb-community-card-actions">{rejecting ? <div className="bb-community-reject-form"><label htmlFor={`reason-${application.id}`}>Reason for rejecting membership</label><textarea id={`reason-${application.id}`} rows="2" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what the donor should address" /><button className="bb-community-button bb-community-button--danger" type="button" disabled={busy || !reason.trim()} onClick={reject}>Confirm rejection</button><button className="bb-community-button bb-community-button--light" type="button" onClick={() => setRejecting(false)}>Cancel</button></div> : <><button className="bb-community-button bb-community-button--primary" type="button" disabled={busy || !allVerified} title={!allVerified ? "Verify all required documents before approving" : ""} onClick={approve}>{busy ? "Saving…" : "Approve membership"}</button><button className="bb-community-button bb-community-button--danger" type="button" disabled={busy} onClick={() => setRejecting(true)}>Reject membership</button></>}</div>}
  </article>;
}

export function CommunityAdminDashboard() {
  const data = useCommunityData();
  const [upcomingCamps, setUpcomingCamps] = useState([]);
  const [sharedRequests, setSharedRequests] = useState([]);
  useEffect(() => {
    let active = true;
    Promise.all([api("/communities/my/camps/"), api("/communities/my/blood-coordination/")]).then(([camps, requests]) => {
      if (active) { setUpcomingCamps((camps.results || []).filter((item) => new Date(item.starts_at) >= new Date()).slice(0, 3)); setSharedRequests(requests.results || []); }
    }).catch((error) => console.error("Community dashboard event summary failed:", error));
    return () => { active = false; };
  }, []);
  const pending = data.applications.filter((item) => item.status === "pending");
  const approvedApplications = data.applications.filter((item) => item.status === "accepted").length;
  const rejectedApplications = data.applications.filter((item) => item.status === "rejected").length;
  const accepted = data.members;
  const reviewedDocuments = data.applications.reduce((count, item) => count + (item.documents || []).filter((doc) => doc.uploaded && doc.status !== "pending").length, 0);
  return <Page eyebrow="COMMUNITY OVERVIEW" title={data.community?.name || "Community dashboard"} subtitle="Review donor membership, keep your community profile current, and stay connected with your members." action={<span className="bb-community-date">{new Date().toLocaleDateString("en-IN", { dateStyle: "full" })}</span>}>
    {data.error && <div className="bb-community-alert" role="alert">{data.error}<button className="bb-community-button bb-community-button--light" type="button" onClick={data.reload}>Retry</button></div>}
    {data.loading ? <Loading /> : <>
      <div className="bb-community-stat-grid"><div className="bb-community-stat"><span>Pending applications</span><strong>{pending.length}</strong><small>Awaiting your review</small></div><div className="bb-community-stat"><span>Community members</span><strong>{accepted.length}</strong><small>Approved donors</small></div><div className="bb-community-stat"><span>Community rating</span><strong>{data.reviewSummary.rating.toFixed(1)}<small> / 5</small></strong><small>{data.reviewSummary.count} donor reviews</small></div><div className="bb-community-stat"><span>Documents reviewed</span><strong>{reviewedDocuments}</strong><small>Across donor applications</small></div></div>
      <div className="bb-community-dashboard-lower"><Panel title="Community information" description="Your public profile details for donors.">{data.community ? <div className="bb-community-simple-list"><div className="bb-community-simple-row"><div><strong>Location</strong><span>{[data.community.city, data.community.state].filter(Boolean).join(", ") || "Not set"}</span></div></div><div className="bb-community-simple-row"><div><strong>Contact</strong><span>{data.community.email || data.community.mobile_number || "Not set"}</span></div></div><div className="bb-community-simple-row"><div><strong>Profile</strong><span>{data.community.description || "Add a description to help donors learn about your community."}</span></div></div></div> : <Empty title="Community profile not configured">Add your community details to complete the workspace profile.</Empty>}</Panel><Panel title="Quick actions" description="Go directly to common community tasks."><div className="bb-community-card-actions"><Link className="bb-community-button bb-community-button--primary" to="/community/applications">Review applications</Link><Link className="bb-community-button bb-community-button--light" to="/community/members">Browse members</Link><Link className="bb-community-button bb-community-button--light" to="/community/profile">Update community profile</Link></div></Panel></div>
      {!data.community && <div className="bb-community-alert">Your community profile has not been configured. Add profile details to make this workspace ready.</div>}
      <Panel title="Applications needing attention" description="Review each donor’s required documents before approving membership." action={<Link className="bb-community-button bb-community-button--light" to="/community/applications">View all</Link>}>
        {pending.length ? <div className="bb-community-list">{pending.slice(0, 3).map((item) => <ApplicationCard key={item.id} application={item} onChanged={data.reload} />)}</div> : <Empty title="No pending applications">New donor membership applications will appear here.</Empty>}
      </Panel>
      <div className="bb-community-dashboard-lower"><Panel title="Recent members" description="Donors who have joined your community.">{accepted.length ? <div className="bb-community-simple-list">{accepted.slice(0, 5).map((member) => <div key={member.id} className="bb-community-simple-row"><div><strong>{member.donor_name}</strong><span>{member.blood_group || "Blood group not provided"}</span></div><small>Joined {formatDate(member.reviewed_at)}</small></div>)}</div> : <Empty title="No members yet">Approved donor memberships will show here.</Empty>}</Panel><Panel title="Community rating" description="Ratings submitted by accepted donors."><div className="bb-community-rating-summary"><strong>{data.reviewSummary.rating.toFixed(1)}<span>/5</span></strong><span className="bb-community-stars">{"★".repeat(Math.round(data.reviewSummary.rating))}{"☆".repeat(5 - Math.round(data.reviewSummary.rating))}</span><small>Based on {data.reviewSummary.count} reviews</small></div>{data.reviews.slice(0, 3).map((review) => <div className="bb-community-review-row" key={review.id}><strong>{review.donor_name} <span>{"★".repeat(review.rating)}</span></strong><p>{review.review || "No written comment"}</p></div>)}</Panel></div>
      <div className="bb-community-dashboard-lower"><Panel title="Membership response insights" description="Counts reflect membership application records returned by the backend."><div className="bb-community-simple-list"><div className="bb-community-simple-row"><div><strong>Approved</strong><span>Membership accepted</span></div><strong>{approvedApplications}</strong></div><div className="bb-community-simple-row"><div><strong>Rejected</strong><span>Membership declined</span></div><strong>{rejectedApplications}</strong></div><div className="bb-community-simple-row"><div><strong>Awaiting review</strong><span>Pending applications</span></div><strong>{pending.length}</strong></div></div></Panel><Panel title="Upcoming community calendar" description="Scheduled camps are shown from persisted community event records." action={<Link className="bb-community-button bb-community-button--light" to="/community/donation-camps">Manage camps</Link>}>{upcomingCamps.length ? <div className="bb-community-simple-list">{upcomingCamps.map((camp) => <div className="bb-community-simple-row" key={camp.id}><div><strong>{camp.title}</strong><span>{camp.venue}{camp.city ? ` · ${camp.city}` : ""}</span></div><small>{formatDateTime(camp.starts_at)}</small></div>)}</div> : <Empty title="No upcoming camps">Create a camp to add a date to the community calendar.</Empty>}</Panel></div>
      <Panel title="Shared hospital coordination" description="Only request metadata explicitly shared by hospital partners is included." action={<Link className="bb-community-button bb-community-button--light" to="/community/blood-coordination">Open coordination</Link>}>{sharedRequests.length ? <div className="bb-community-simple-list">{sharedRequests.slice(0, 3).map((item) => <div className="bb-community-simple-row" key={item.id}><div><strong>{item.hospital_name} · {item.blood_group}</strong><span>{item.request_id} · {item.eligible_member_count} eligible members · {item.invitation_counts?.accepted || 0} accepted invitations</span></div><StatusBadge status={item.request_status} /></div>)}</div> : <Empty title="No requests shared with this community">A hospital controls request sharing. Donor selection and invitations remain in its existing workflow.</Empty>}</Panel>
    </>}
  </Page>;
}

export function CommunityApplications() {
  const data = useCommunityData();
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => data.applications.filter((item) => (filter === "all" || item.status === filter) && `${item.donor_name} ${item.donor_email} ${item.blood_group}`.toLowerCase().includes(query.toLowerCase())), [data.applications, filter, query]);
  return <Page eyebrow="DONOR MANAGEMENT" title="Membership applications" subtitle="Review donor information and documents, then approve or reject membership requests.">
    {data.error && <div className="bb-community-alert" role="alert">{data.error}<button className="bb-community-button bb-community-button--light" type="button" onClick={data.reload}>Retry</button></div>}
    <Panel title="Applications" description={`${data.applications.length} applications in total`} action={<button className="bb-community-button bb-community-button--light" type="button" onClick={data.reload}>Refresh</button>}>
      <div className="bb-community-toolbar"><label className="bb-community-search"><span>Search donors</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or blood group" /></label><label className="bb-community-filter"><span>Status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending">Pending</option><option value="accepted">Approved</option><option value="rejected">Rejected</option><option value="all">All applications</option></select></label></div>
      {data.loading ? <Loading /> : filtered.length ? <div className="bb-community-list">{filtered.map((item) => <ApplicationCard key={item.id} application={item} onChanged={data.reload} detail />)}</div> : <Empty title="No applications found">Try another status filter or search term.</Empty>}
    </Panel>
  </Page>;
}

export function CommunityMembers() {
  const data = useCommunityData();
  const [query, setQuery] = useState("");
  const [bloodGroup, setBloodGroup] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const pending = data.applications.filter((item) => item.status === "pending");
  const groups = useMemo(() => [...new Set(data.members.map((item) => item.blood_group).filter(Boolean))].sort(), [data.members]);
  const members = useMemo(() => data.members.filter((item) => (bloodGroup === "all" || item.blood_group === bloodGroup) && (availability === "all" || item.availability === availability) && `${item.donor_name} ${item.donor_email} ${item.blood_group}`.toLowerCase().includes(query.toLowerCase())), [data.members, query, bloodGroup, availability]);
  const selected = members.find((member) => String(member.id) === String(selectedId)) || null;
  const bloodCounts = useMemo(() => data.members.reduce((counts, member) => { const group = member.blood_group || "Not provided"; counts[group] = (counts[group] || 0) + 1; return counts; }, {}), [data.members]);
  return <Page eyebrow="DONOR MANAGEMENT" title="Community members" subtitle="View donors whose membership has been approved.">
    {data.error && <div className="bb-community-alert" role="alert">{data.error}<button className="bb-community-button bb-community-button--light" type="button" onClick={data.reload}>Retry</button></div>}
    <div className="bb-community-stat-grid"><div className="bb-community-stat"><span>Approved members</span><strong>{data.members.length}</strong><small>Active community memberships</small></div><div className="bb-community-stat"><span>Pending requests</span><strong>{pending.length}</strong><small>Need community review</small></div><div className="bb-community-stat"><span>Blood groups</span><strong>{Object.keys(bloodCounts).filter((group) => group !== "Not provided").length}</strong><small>Represented in the directory</small></div><div className="bb-community-stat"><span>Directory results</span><strong>{members.length}</strong><small>Matching current filters</small></div></div>
    {pending.length > 0 && <Panel title="Pending membership requests" description="Applications stay in the existing review workflow until their required documents are reviewed." action={<Link className="bb-community-button bb-community-button--primary" to="/community/applications">Review requests</Link>}><p className="bb-community-pending-summary">{pending.length} donor {pending.length === 1 ? "request is" : "requests are"} awaiting review.</p></Panel>}
    <Panel title="Members" description={`${data.members.length} approved donors`} action={<button className="bb-community-button bb-community-button--light" type="button" onClick={data.reload}>Refresh</button>}>
      <div className="bb-community-toolbar"><label className="bb-community-search"><span>Search members</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or blood group" /></label><label className="bb-community-filter"><span>Blood group</span><select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}><option value="all">All groups</option>{groups.map((group) => <option key={group} value={group}>{group} ({bloodCounts[group]})</option>)}</select></label><label className="bb-community-filter"><span>Availability</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="all">All</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="private">Not shared</option></select></label></div>
      {data.loading ? <Loading /> : members.length ? <div className="bb-community-members-layout"><div className="bb-community-table-wrap"><table className="bb-community-table"><thead><tr><th>Donor</th><th>Blood group</th><th>Availability</th><th>Member since</th><th>Status</th><th><span className="bb-visually-hidden">Details</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.id} className={String(member.id) === String(selectedId) ? "is-selected" : ""}><td><strong>{member.donor_name}</strong></td><td>{member.blood_group || "—"}</td><td><StatusBadge status={member.availability} /></td><td>{formatDate(member.reviewed_at)}</td><td><StatusBadge status={member.status} /></td><td><button className="bb-community-button bb-community-button--light" type="button" aria-pressed={String(member.id) === String(selectedId)} onClick={() => setSelectedId(member.id)}>Details</button></td></tr>)}</tbody></table></div><aside className="bb-community-member-inspector" aria-live="polite">{selected ? <><p className="bb-community-eyebrow">MEMBER DETAILS</p><h3>{selected.donor_name || "Community donor"}</h3><StatusBadge status={selected.status} /><dl><div><dt>Blood group</dt><dd>{selected.blood_group || "Not provided"}</dd></div><div><dt>Availability</dt><dd>{selected.availability === "private" ? "Not shared with the community" : selected.availability}</dd></div><div><dt>Sharing preference</dt><dd>{selected.sharing_preference}</dd></div><div><dt>Email</dt><dd>{selected.donor_email || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{selected.donor_phone || "Not provided"}</dd></div><div><dt>Member since</dt><dd>{formatDate(selected.reviewed_at)}</dd></div></dl></> : <Empty title="Select a member">Choose a directory row to review the contact and consented availability details available to your community.</Empty>}</aside></div> : <Empty title="No members found">Try another blood group, availability, or search term.</Empty>}
    </Panel>
  </Page>;
}

export function CommunityProfile() {
  const { community, profile, reloadCommunity } = useOutletContext();
  const data = useCommunityData();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState(null);
  useEffect(() => { if (data.community) setForm({ ...data.community }); }, [data.community]);
  const current = form || data.community || community || {};
  const change = (key, value) => setForm((old) => ({ ...(old || data.community || {}), [key]: value }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const body = new FormData();
      ["name", "description", "email", "mobile_number", "address", "city", "state", "pincode", "latitude", "longitude"].forEach((key) => body.append(key, current[key] ?? ""));
      if (logo) body.append("logo", logo);
      await api("/communities/my/", { method: "POST", body });
      await reloadCommunity(); await data.reload(); showToast("Community profile saved.");
    } catch (err) { showToast(err.message, "error"); }
    finally { setSaving(false); }
  };
  return <Page eyebrow="COMMUNITY SETTINGS" title="Community profile & reviews" subtitle="Keep the public community details accurate and see feedback from your members.">
    {data.error && <div className="bb-community-alert" role="alert">{data.error}</div>}
    <div className="bb-community-profile-grid"><Panel title="Community details" description="These details are visible to donors exploring communities."><ProfilePictureUpload picture={profile?.profile_picture} name={profile?.full_name || profile?.email} /><form className="bb-community-form" onSubmit={save}><label>Community name<input required maxLength="200" value={current.name || ""} onChange={(event) => change("name", event.target.value)} /></label><label>Description<textarea rows="4" value={current.description || ""} onChange={(event) => change("description", event.target.value)} /></label><div className="bb-community-form-grid"><label>Email<input type="email" value={current.email || ""} onChange={(event) => change("email", event.target.value)} /></label><label>Phone<input value={current.mobile_number || ""} onChange={(event) => change("mobile_number", event.target.value)} /></label></div><label>Address<textarea rows="3" value={current.address || ""} onChange={(event) => change("address", event.target.value)} /></label><div className="bb-community-form-grid"><label>City<input value={current.city || ""} onChange={(event) => change("city", event.target.value)} /></label><label>State<input value={current.state || ""} onChange={(event) => change("state", event.target.value)} /></label><label>Postal code<input value={current.pincode || ""} onChange={(event) => change("pincode", event.target.value)} /></label></div><div className="bb-community-form-grid"><label>Latitude<input type="number" step="any" min="-90" max="90" value={current.latitude ?? ""} onChange={(event) => change("latitude", event.target.value)} /></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={current.longitude ?? ""} onChange={(event) => change("longitude", event.target.value)} /></label></div><label>Community logo<input type="file" accept="image/*" onChange={(event) => setLogo(event.target.files?.[0] || null)} /></label><button className="bb-community-button bb-community-button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save community profile"}</button></form></Panel><Panel title="Member reviews" description="Feedback shared by approved community donors."><div className="bb-community-rating-summary"><strong>{data.reviewSummary.rating.toFixed(1)}<span>/5</span></strong><span className="bb-community-stars">{"★".repeat(Math.round(data.reviewSummary.rating))}{"☆".repeat(5 - Math.round(data.reviewSummary.rating))}</span><small>{data.reviewSummary.count} donor reviews</small></div>{data.loading ? <Loading label="Loading reviews…" /> : data.reviews.length ? data.reviews.map((review) => <article className="bb-community-review-card" key={review.id}><header><strong>{review.donor_name}</strong><span className="bb-community-stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></header><small>{formatDateTime(review.created_at)}</small><p>{review.review || "No written comment"}</p></article>) : <Empty title="No reviews yet">Reviews submitted by members will appear here.</Empty>}</Panel></div>
  </Page>;
}

export function CommunityBloodCoordination() {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [bloodGroup, setBloodGroup] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [requestStatus, setRequestStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notifying, setNotifying] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await api("/communities/my/blood-coordination/"); setRequests(result.results || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const filtered = useMemo(() => requests.filter((item) => {
    const active = ["open", "matching", "partially_fulfilled"].includes(item.request_status);
    return (requestStatus === "all" || (requestStatus === "active" ? active : !active))
      && (bloodGroup === "all" || item.blood_group === bloodGroup)
      && (urgency === "all" || item.urgency === urgency)
      && `${item.hospital_name} ${item.request_id} ${item.blood_group}`.toLowerCase().includes(query.toLowerCase());
  }), [requests, query, bloodGroup, urgency, requestStatus]);
  const selected = filtered.find((item) => item.request_id === selectedId) || filtered[0] || null;
  const openCount = requests.filter((item) => ["open", "matching", "partially_fulfilled"].includes(item.request_status)).length;
  const eligibleCount = requests.reduce((sum, item) => sum + (item.eligible_member_count || 0), 0);
  const acceptedCount = requests.reduce((sum, item) => sum + (item.invitation_counts?.accepted || 0), 0);
  const notifyHospital = async () => {
    if (!selected || !selected.eligible_member_count) return;
    setNotifying(true);
    try { const result = await api(`/communities/my/blood-coordination/${selected.request_id}/notify-hospital/`, { method: "POST", body: JSON.stringify({}) }); showToast(result.already_notified ? "The hospital already has this coordination request." : "The hospital was asked to review eligible community members."); }
    catch (err) { showToast(err.message, "error"); }
    finally { setNotifying(false); }
  };
  return <Page eyebrow="COMMUNITY COORDINATION" title="Blood coordination" subtitle="Coordinate hospital requests explicitly shared with your verified community.">
    {error && <div className="bb-community-alert" role="alert">{error}<button className="bb-community-button bb-community-button--light" type="button" onClick={reload}>Retry</button></div>}
    <div className="bb-community-stat-grid"><div className="bb-community-stat"><span>Shared requests</span><strong>{requests.length}</strong><small>Authorized by hospital partners</small></div><div className="bb-community-stat"><span>Active requests</span><strong>{openCount}</strong><small>Open or matching</small></div><div className="bb-community-stat"><span>Eligible community donors</span><strong>{eligibleCount}</strong><small>Matching donors across shared requests</small></div><div className="bb-community-stat"><span>Accepted invitations</span><strong>{acceptedCount}</strong><small>Responses from community members</small></div></div>
    <div className="bb-community-toolbar"><label className="bb-community-search"><span>Search requests</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Request ID, hospital, or blood group" /></label><label className="bb-community-filter"><span>Blood group</span><select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}><option value="all">All groups</option>{["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"].map((group) => <option key={group}>{group}</option>)}</select></label><label className="bb-community-filter"><span>Urgency</span><select value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="all">All urgency</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="normal">Normal</option></select></label><label className="bb-community-filter"><span>Status</span><select value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}><option value="active">Active</option><option value="closed">Closed</option><option value="all">All</option></select></label></div>
    {loading ? <Loading /> : filtered.length ? <div className="bb-community-coordination-layout"><div className="bb-community-request-list">{filtered.map((item) => <button type="button" key={item.id} className={`bb-community-request-card${selected?.id === item.id ? " is-selected" : ""}`} onClick={() => setSelectedId(item.request_id)}><span className="bb-community-request-card-top"><strong>{item.hospital_name}</strong><StatusBadge status={item.urgency} /></span><span>{item.request_id} · {item.blood_group} · {item.units_required} units</span><span>{item.hospital_city || "Location not provided"} · {item.request_status.replaceAll("_", " ")}</span><small>{item.required_by ? `Required by ${formatDateTime(item.required_by)}` : "No required-by date"}</small></button>)}</div>{selected && <section className="bb-community-request-detail"><div className="bb-community-panel-header"><div><p className="bb-community-eyebrow">SHARED HOSPITAL REQUEST</p><h2>{selected.hospital_name} · {selected.request_id}</h2></div><StatusBadge status={selected.request_status} /></div><div className="bb-community-request-facts"><span><strong>Blood group</strong>{selected.blood_group}</span><span><strong>Units</strong>{selected.units_required}</span><span><strong>Urgency</strong>{selected.urgency}</span><span><strong>City</strong>{selected.hospital_city || "Not provided"}</span><span><strong>Required by</strong>{formatDateTime(selected.required_by)}</span></div><Panel title="Matching donors" description="Only an aggregate is shown here. Donor identities and exact locations remain private."><div className="bb-community-match-count"><strong>{selected.eligible_member_count}</strong><span>eligible community members based on current matching rules</span></div><p className="bb-community-privacy-note">Donors are matched using blood compatibility, active availability, approved membership, location and travel radius. Donor selection and invitations remain controlled by the hospital through the existing matching workflow.</p><button className="bb-community-button bb-community-button--primary" type="button" disabled={!selected.eligible_member_count || notifying || !["open", "matching", "partially_fulfilled"].includes(selected.request_status)} onClick={notifyHospital}>{notifying ? "Sending…" : "Ask hospital to review matches"}</button></Panel><Panel title="Coordination progress" description="Invitation states are aggregated from persisted DonorInvitation records."><div className="bb-community-progress-list"><div><span>Shared by hospital</span><StatusBadge status="accepted" /></div><div><span>Invitations pending</span><strong>{selected.invitation_counts?.pending || 0}</strong></div><div><span>Invitations accepted</span><strong>{selected.invitation_counts?.accepted || 0}</strong></div><div><span>Invitations declined</span><strong>{selected.invitation_counts?.declined || 0}</strong></div></div></Panel></section>}</div> : <Empty title="No shared requests">A hospital must explicitly share a request with your verified community before its limited coordination details appear here.</Empty>}
  </Page>;
}

export function CommunityAnnouncements() {
  const [items, setItems] = useState([]); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [selectedId, setSelectedId] = useState(null); const [form, setForm] = useState({ title: "", message: "", audience: "members", publication_date: "" }); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const reload = useCallback(async () => { setLoading(true); setError(""); try { const data = await api("/communities/my/announcements/"); setItems(data.results || []); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useEffect(() => { reload(); }, [reload]);
  const [audienceCount, setAudienceCount] = useState(0);
  useEffect(() => { let active = true; api("/communities/my/members/").then((data) => { if (active) setAudienceCount(data.count || data.results?.length || 0); }).catch(() => {}); return () => { active = false; }; }, []);
  const visible = useMemo(() => items.filter((item) => (filter === "all" || item.status === filter) && `${item.title} ${item.message}`.toLowerCase().includes(query.toLowerCase())), [items, filter, query]);
  const counts = useMemo(() => items.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {}), [items]);
  const reset = () => { setSelectedId(null); setForm({ title: "", message: "", audience: "members", publication_date: "" }); };
  const edit = (item) => { setSelectedId(item.id); setForm({ title: item.title, message: item.message, audience: item.audience, publication_date: item.publication_date || "" }); };
  const save = async (publish = false) => {
    setSaving(true); setError("");
    try { const body = { ...form, publication_date: form.publication_date || null }; let saved;
      if (selectedId) saved = await api(`/communities/my/announcements/${selectedId}/`, { method: "PATCH", body: JSON.stringify(body) });
      else saved = await api("/communities/my/announcements/", { method: "POST", body: JSON.stringify(body) });
      if (publish) saved = await api(`/communities/my/announcements/${saved.id}/publish/`, { method: "POST", body: JSON.stringify({}) });
      showToast(publish ? "Announcement published." : "Draft saved."); await reload(); edit(saved);
    } catch (err) { setError(err.message); showToast(err.message, "error"); }
    finally { setSaving(false); }
  };
  const action = async (item, actionName) => { try { await api(`/communities/my/announcements/${item.id}/${actionName}/`, { method: "POST", body: JSON.stringify({}) }); showToast(`Announcement ${actionName === "pin" ? (item.is_pinned ? "unpinned" : "pinned") : `${actionName}d`}.`); await reload(); } catch (err) { showToast(err.message, "error"); } };
  return <Page eyebrow="COMMUNITY UPDATES" title="Announcements" subtitle="Keep your community informed with thoughtful, privacy-safe updates.">
    {error && <div className="bb-community-alert" role="alert">{error}<button className="bb-community-button bb-community-button--light" type="button" onClick={() => setError("")}>Dismiss</button></div>}
    <div className="bb-community-stat-grid"><div className="bb-community-stat"><span>Published</span><strong>{counts.published || 0}</strong><small>Visible in the member feed</small></div><div className="bb-community-stat"><span>Drafts</span><strong>{counts.draft || 0}</strong><small>Not yet published</small></div><div className="bb-community-stat"><span>Archived</span><strong>{counts.archived || 0}</strong><small>Retained in community records</small></div><div className="bb-community-stat"><span>Member audience</span><strong>{audienceCount}</strong><small>Approved members</small></div></div>
    <div className="bb-community-toolbar"><label className="bb-community-search"><span>Search announcements</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles or messages" /></label><label className="bb-community-filter"><span>Status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option><option value="archived">Archived</option></select></label><button className="bb-community-button bb-community-button--primary" type="button" onClick={reset}>Create announcement</button></div>
    {loading ? <Loading /> : <div className="bb-community-feature-layout"><Panel title="Community announcements" description={`${visible.length} matching announcements`}><div className="bb-community-list">{visible.map((item) => <article className={`bb-community-announcement-card${item.id === selectedId ? " is-selected" : ""}`} key={item.id}><button type="button" className="bb-community-announcement-select" onClick={() => edit(item)}><span><strong>{item.title}</strong>{item.is_pinned && <span className="bb-community-pin-label">Pinned</span>}</span><StatusBadge status={item.status} /><small>{item.publication_date ? formatDate(item.publication_date) : formatDate(item.created_at)}</small><p>{item.message}</p></button><div className="bb-community-card-actions"><button className="bb-community-button bb-community-button--light" type="button" onClick={() => edit(item)}>Edit</button>{item.status === "draft" && <button className="bb-community-button bb-community-button--primary" type="button" onClick={() => action(item, "publish")}>Publish</button>}{item.status === "published" && <button className="bb-community-button bb-community-button--light" type="button" onClick={() => action(item, "pin")}>{item.is_pinned ? "Unpin" : "Pin"}</button>}{item.status !== "archived" && <button className="bb-community-button bb-community-button--danger" type="button" onClick={() => action(item, "archive")}>Archive</button>}</div></article>)}{!visible.length && <Empty title="No announcements found">Create a draft to share an update with approved community members.</Empty>}</div></Panel><Panel title={selectedId ? "Edit announcement" : "Create announcement"} description="Only approved members of this community can view published posts."><form className="bb-community-form" onSubmit={(event) => { event.preventDefault(); save(false); }}><label>Title<input required maxLength="200" value={form.title} onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))} /></label><label>Message<textarea required maxLength="10000" rows="6" value={form.message} onChange={(event) => setForm((old) => ({ ...old, message: event.target.value }))} /></label><label>Audience<select value={form.audience} onChange={(event) => setForm((old) => ({ ...old, audience: event.target.value }))}><option value="members">Approved community members ({audienceCount})</option></select></label><label>Publication date<input type="date" value={form.publication_date} onChange={(event) => setForm((old) => ({ ...old, publication_date: event.target.value }))} /></label><div className="bb-community-card-actions"><button className="bb-community-button bb-community-button--light" type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button><button className="bb-community-button bb-community-button--primary" type="button" disabled={saving || !form.title.trim() || !form.message.trim()} onClick={() => save(true)}>{saving ? "Saving…" : "Publish"}</button><button className="bb-community-button bb-community-button--danger" type="button" onClick={reset}>Discard changes</button></div></form><div className="bb-community-feed-preview"><span className="bb-community-eyebrow">MEMBER FEED PREVIEW</span><h3>{form.title || "Announcement title"}</h3><p>{form.message || "Your announcement preview will appear here."}</p><small>Audience: approved community members · {form.publication_date || "Date on publication"}</small></div></Panel></div>}
  </Page>;
}

export function CommunityDonationCamps() {
  const [items, setItems] = useState([]); const [registrations, setRegistrations] = useState([]); const [selectedId, setSelectedId] = useState(null); const [query, setQuery] = useState(""); const [period, setPeriod] = useState("upcoming"); const [form, setForm] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const reload = useCallback(async () => { setLoading(true); setError(""); try { const data = await api("/communities/my/camps/"); setItems(data.results || []); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  const loadRegistrations = useCallback(async (campId) => { if (!campId) { setRegistrations([]); return; } try { const data = await api(`/communities/my/camps/${campId}/registrations/`); setRegistrations(data.results || []); } catch (err) { setError(err.message); } }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { loadRegistrations(selectedId); }, [selectedId, loadRegistrations]);
  const selected = items.find((item) => item.id === selectedId) || null;
  const filtered = useMemo(() => items.filter((item) => { const upcoming = new Date(item.starts_at) >= new Date(); return (period === "all" || (period === "upcoming" ? upcoming : !upcoming)) && `${item.title} ${item.venue} ${item.city}`.toLowerCase().includes(query.toLowerCase()); }), [items, period, query]);
  const reset = () => { setSelectedId(null); setForm({ title: "", description: "", starts_at: "", venue: "", city: "", capacity: "" }); };
  const edit = (item) => { setSelectedId(item.id); setForm({ title: item.title, description: item.description || "", starts_at: toLocalDateTimeInput(item.starts_at), venue: item.venue, city: item.city || "", capacity: item.capacity }); };
  const save = async (event) => { event.preventDefault(); setSaving(true); setError(""); try { const body = { ...form, starts_at: new Date(form.starts_at).toISOString(), capacity: Number(form.capacity) }; const saved = selectedId ? await api(`/communities/my/camps/${selectedId}/`, { method: "PATCH", body: JSON.stringify(body) }) : await api("/communities/my/camps/", { method: "POST", body: JSON.stringify(body) }); showToast(selectedId ? "Donation camp updated." : "Donation camp created."); await reload(); setSelectedId(saved.id); } catch (err) { setError(err.message); showToast(err.message, "error"); } finally { setSaving(false); } };
  const closeRegistration = async () => { if (!selected) return; try { await api(`/communities/my/camps/${selected.id}/close-registration/`, { method: "POST", body: JSON.stringify({}) }); showToast("Camp registration closed."); await reload(); } catch (err) { showToast(err.message, "error"); } };
  const upcoming = items.filter((item) => new Date(item.starts_at) >= new Date()).length;
  const registered = items.reduce((sum, item) => sum + item.registered_count, 0);
  const capacity = items.reduce((sum, item) => sum + item.capacity, 0);
  return <Page eyebrow="COMMUNITY EVENTS" title="Donation camps" subtitle="Plan local camps and keep participation clear, safe and voluntary." action={<button className="bb-community-button bb-community-button--primary" type="button" onClick={reset}>+ Add camp</button>}>
    {error && <div className="bb-community-alert" role="alert">{error}<button className="bb-community-button bb-community-button--light" type="button" onClick={() => setError("")}>Dismiss</button></div>}
    <div className="bb-community-stat-grid"><div className="bb-community-stat"><span>Total camps</span><strong>{items.length}</strong><small>Persisted community events</small></div><div className="bb-community-stat"><span>Upcoming</span><strong>{upcoming}</strong><small>Scheduled in the future</small></div><div className="bb-community-stat"><span>Registered</span><strong>{registered}</strong><small>Active donor registrations</small></div><div className="bb-community-stat"><span>Open places</span><strong>{Math.max(0, capacity - registered)}</strong><small>Across current camps</small></div></div>
    <div className="bb-community-toolbar"><label className="bb-community-search"><span>Search camps</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Camp, venue, or city" /></label><label className="bb-community-filter"><span>When</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All camps</option></select></label></div>
    {loading ? <Loading /> : <div className="bb-community-feature-layout"><Panel title="Community camps" description={`${filtered.length} matching camps`}><div className="bb-community-list">{filtered.map((item) => <button type="button" className={`bb-community-camp-card${selectedId === item.id ? " is-selected" : ""}`} key={item.id} onClick={() => { setSelectedId(item.id); setForm(null); }}><span className="bb-community-request-card-top"><strong>{item.title}</strong><StatusBadge status={item.registration_open ? "open" : "closed"} /></span><span>{formatDateTime(item.starts_at)}</span><span>{item.venue}{item.city ? ` · ${item.city}` : ""}</span><span>{item.registered_count} / {item.capacity} registered</span></button>)}{!filtered.length && <Empty title="No camps found">Create an upcoming donation camp or change the time filter.</Empty>}</div></Panel><Panel title={form ? (selectedId ? "Edit camp details" : "Add a donation camp") : (selected ? "Camp details" : "Camp overview")} description={form ? "Share clear venue and timing details with your members." : "Registration counts are calculated from donor registrations."}>{form ? <form className="bb-community-form" onSubmit={save}><label>Camp title<input required maxLength="200" value={form.title} onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))} /></label><label>Description<textarea rows="3" value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} /></label><label>Date and time<input required type="datetime-local" value={form.starts_at} onChange={(event) => setForm((old) => ({ ...old, starts_at: event.target.value }))} /></label><label>Venue<input required maxLength="250" value={form.venue} onChange={(event) => setForm((old) => ({ ...old, venue: event.target.value }))} /></label><div className="bb-community-form-grid"><label>City<input value={form.city} onChange={(event) => setForm((old) => ({ ...old, city: event.target.value }))} /></label><label>Capacity<input required type="number" min="1" max="32767" value={form.capacity} onChange={(event) => setForm((old) => ({ ...old, capacity: event.target.value }))} /></label></div><div className="bb-community-card-actions"><button className="bb-community-button bb-community-button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save camp"}</button><button className="bb-community-button bb-community-button--light" type="button" onClick={() => setForm(null)}>Discard</button></div></form> : selected ? <><div className="bb-community-simple-list"><div className="bb-community-simple-row"><div><strong>Date and time</strong><span>{formatDateTime(selected.starts_at)}</span></div></div><div className="bb-community-simple-row"><div><strong>Venue</strong><span>{selected.venue} · {selected.city || "City not set"}</span></div></div><div className="bb-community-simple-row"><div><strong>Organizer</strong><span>{selected.organizer}</span></div></div><div className="bb-community-simple-row"><div><strong>Registration</strong><span>{selected.registered_count} registered · {selected.available_places} places remaining of {selected.capacity}</span></div></div><div className="bb-community-simple-row"><div><strong>Description</strong><span>{selected.description || "No additional details."}</span></div></div></div><div className="bb-community-card-actions"><button className="bb-community-button bb-community-button--light" type="button" onClick={() => edit(selected)}>Edit camp details</button>{selected.registration_open && <button className="bb-community-button bb-community-button--danger" type="button" onClick={closeRegistration}>Close registration</button>}</div><h3 className="bb-community-subheading">Registered participants</h3>{registrations.length ? <div className="bb-community-simple-list">{registrations.map((row) => <div className="bb-community-simple-row" key={row.id}><div><strong>{row.donor_name}</strong><span>Registered {formatDate(row.created_at)}</span></div></div>)}</div> : <Empty title="No visible registrations">Participants who have chosen community visibility will appear here.</Empty>}</> : <Empty title="Select a camp">Choose a camp to inspect its schedule, capacity and consented registrations.</Empty>}</Panel></div>}
  </Page>;
}

export function CommunityActivityHistory() {
  const data = useCommunityData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [activityStatus, setActivityStatus] = useState("all");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const loadActivity = useCallback(async () => { setActivityLoading(true); setActivityError(""); try { const response = await api("/communities/my/activity/"); setActivity(response.results || []); } catch (err) { setActivityError(err.message); } finally { setActivityLoading(false); } }, []);
  useEffect(() => { loadActivity(); }, [loadActivity]);
  const filteredActivity = useMemo(() => activity.filter((item) => (kind === "all" || item.kind === kind) && (activityStatus === "all" || item.status === activityStatus) && (!date || String(item.at).slice(0, 10) === date) && `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "newest" ? new Date(b.at) - new Date(a.at) : new Date(a.at) - new Date(b.at)), [activity, kind, query, activityStatus, date, sort]);

  return <Page eyebrow="COMMUNITY RECORDS" title="Community activity history" subtitle="A recent view of membership decisions and member feedback available from community records.">
    {(data.error || activityError) && <div className="bb-community-alert" role="alert">{data.error || activityError}<button className="bb-community-button bb-community-button--light" type="button" onClick={() => { data.reload(); loadActivity(); }}>Retry</button></div>}
    <div className="bb-community-stat-grid"><div className="bb-community-stat"><span>Applications</span><strong>{data.applications.length}</strong><small>Membership records</small></div><div className="bb-community-stat"><span>Members</span><strong>{data.members.length}</strong><small>Approved donors</small></div><div className="bb-community-stat"><span>Reviews</span><strong>{data.reviewSummary.count}</strong><small>Member feedback</small></div><div className="bb-community-stat"><span>Rating</span><strong>{data.reviewSummary.rating.toFixed(1)}<small> / 5</small></strong><small>Community average</small></div></div>
    <Panel title="Recent activity" description="Events are derived from community application, membership, and review records.">
      <div className="bb-community-toolbar"><label className="bb-community-search"><span>Search activity</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Donor or activity" /></label><label className="bb-community-filter"><span>Activity</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All activity</option><option value="application">Applications</option><option value="review">Reviews</option><option value="announcement">Announcements</option><option value="camp">Donation camps</option><option value="camp_registration">Registrations</option></select></label><label className="bb-community-filter"><span>Status</span><select value={activityStatus} onChange={(event) => setActivityStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(activity.map((item) => item.status).filter(Boolean))].sort().map((value) => <option key={value}>{value}</option>)}</select></label><label className="bb-community-filter"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="bb-community-filter"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
      {activityLoading ? <Loading /> : filteredActivity.length ? <div className="bb-community-timeline">{filteredActivity.map((item) => <article className="bb-community-timeline-item" key={item.id}><span className="bb-community-timeline-mark" aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p><small>{formatDateTime(item.at)}</small></div></article>)}</div> : <Empty title={activity.length ? "No matching activity" : "No community activity yet"}>{activity.length ? "Change the activity type, date, or search filters." : "New activity from persisted membership, review, announcement, and camp records will appear here."}</Empty>}
    </Panel>
  </Page>;
}
