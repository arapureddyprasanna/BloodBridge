import { API_BASE_URL } from "../../api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import "./DonorWorkspace.css";

function getCommunityLocation(community) {
  return [community.city, community.state]
    .filter(Boolean)
    .join(", ");
}

function CommunityLogo({ community }) {
  const [imageError, setImageError] = useState(false);

  if (community.logo && !imageError) {
    return (
      <img
        src={community.logo}
        alt=""
        className="bb-community-selection-logo-image"
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <div className="bb-community-selection-logo-fallback">
      {community.name?.charAt(0)?.toUpperCase() || "C"}
    </div>
  );
}

export default function CommunitySelection() {
  const navigate = useNavigate();

  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadCommunities = async () => {
      try {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          navigate("/login", { replace: true });
          return;
        }

        const token = await currentUser.getIdToken();

        const response = await fetch(`${API_BASE_URL}/communities/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Unable to load available communities.");
        }

        const data = await response.json();

        if (!mounted) return;

        setCommunities(Array.isArray(data) ? data : data.results || []);
      } catch (loadError) {
        console.error(
          "Community selection loading failed:",
          loadError
        );

        if (mounted) {
          setError(
            loadError.message ||
              "Unable to load communities right now."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadCommunities();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const filteredCommunities = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return communities;
    }

    return communities.filter((community) => {
      const searchableText = [
        community.name,
        community.description,
        community.city,
        community.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [communities, search]);

  const handleViewDetails = async (community) => {
    setSelectedCommunity(community);
    setDetailsLoading(true);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigate("/login", { replace: true });
        return;
      }

      const token = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/communities/${community.id}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Unable to load community details.");
      }

      const data = await response.json();

      setSelectedCommunity(data);
    } catch (detailsError) {
      console.error(
        "Community details loading failed:",
        detailsError
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleJoinCommunity = async (communityId) => {
    const currentUser = auth.currentUser;

    if (!currentUser || joiningId) {
      return;
    }

    setJoiningId(communityId);
    setError("");

    try {
      const token = await currentUser.getIdToken();

      const response = await fetch(
        `${API_BASE_URL}/communities/${communityId}/join/`,
        {
          method: "POST",
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
            data.message ||
            "Unable to submit your community request."
        );
      }

      /*
       * Community selection is now complete.
       * The next onboarding step is donor document verification.
       */
      navigate("/verification/documents", {
        replace: true,
        state: {
          onboarding: true,
          communityApplication: data.application || data,
        },
      });
    } catch (joinError) {
      console.error(
        "Community join request failed:",
        joinError
      );

      setError(
        joinError.message ||
          "Unable to send your community request."
      );
    } finally {
      setJoiningId(null);
    }
  };

  const closeDetails = () => {
    if (!joiningId) {
      setSelectedCommunity(null);
    }
  };

  return (
    <div className="bb-community-selection-page">
      <div className="bb-community-selection-container">
        <header className="bb-community-selection-header">
          <div className="bb-community-selection-brand">
            <div className="bb-community-selection-brand-icon">
              ♥
            </div>

            <div>
              <strong>BloodBridge</strong>
              <span>DONOR ONBOARDING</span>
            </div>
          </div>

          <div className="bb-community-selection-progress">
            <div className="bb-community-selection-progress-step active">
              <span>1</span>
              <strong>Community</strong>
            </div>

            <div className="bb-community-selection-progress-line" />

            <div className="bb-community-selection-progress-step">
              <span>2</span>
              <strong>Documents</strong>
            </div>

            <div className="bb-community-selection-progress-line" />

            <div className="bb-community-selection-progress-step">
              <span>3</span>
              <strong>Review</strong>
            </div>
          </div>
        </header>

        <main className="bb-community-selection-main">
          <section className="bb-community-selection-intro">
            <div>
              <span className="bb-community-selection-eyebrow">
                STEP 1 OF 3
              </span>

              <h1>Choose your donor community</h1>

              <p>
                Select a verified community that you'd like to
                join. Your community will coordinate your donor
                membership and review your verification documents.
              </p>
            </div>

            <div className="bb-community-selection-trust">
              <span className="bb-community-selection-trust-icon">
                ✓
              </span>

              <div>
                <strong>Verified communities only</strong>
                <span>
                  Community organizations are reviewed before
                  appearing here.
                </span>
              </div>
            </div>
          </section>

          {error && (
            <div
              className="bb-community-selection-error"
              role="alert"
            >
              <span>!</span>
              <div>
                <strong>Something went wrong</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          <section className="bb-community-selection-toolbar">
            <div>
              <strong>
                {loading
                  ? "Finding communities..."
                  : `${communities.length} ${
                      communities.length === 1
                        ? "community"
                        : "communities"
                    } available`}
              </strong>

              <span>
                Choose the community that best fits your location
                and needs.
              </span>
            </div>

            <label className="bb-community-selection-search">
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search communities"
                aria-label="Search communities"
              />
            </label>
          </section>

          {loading ? (
            <div className="bb-community-selection-grid">
              {[1, 2, 3].map((item) => (
                <div
                  className="bb-community-selection-card bb-community-selection-skeleton"
                  key={item}
                >
                  <div className="bb-community-selection-skeleton-top" />
                  <div className="bb-community-selection-skeleton-line large" />
                  <div className="bb-community-selection-skeleton-line" />
                  <div className="bb-community-selection-skeleton-line short" />
                  <div className="bb-community-selection-skeleton-actions" />
                </div>
              ))}
            </div>
          ) : filteredCommunities.length === 0 ? (
            <div className="bb-community-selection-empty">
              <div className="bb-community-selection-empty-icon">
                ♡
              </div>

              <h2>
                {search
                  ? "No communities found"
                  : "No communities are available yet"}
              </h2>

              <p>
                {search
                  ? "Try a different community name or location."
                  : "Verified donor communities will appear here when they become available."}
              </p>

              {search && (
                <button
                  type="button"
                  className="bb-community-selection-secondary-button"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="bb-community-selection-grid">
              {filteredCommunities.map((community) => {
                const location = getCommunityLocation(community);
                const rating = Number(community.rating || 0);

                return (
                  <article
                    className="bb-community-selection-card"
                    key={community.id}
                  >
                    <div className="bb-community-selection-card-top">
                      <CommunityLogo community={community} />

                      <span className="bb-community-selection-verified">
                        <span>✓</span>
                        Verified
                      </span>
                    </div>

                    <div className="bb-community-selection-card-content">
                      <h2>{community.name}</h2>

                      {location && (
                        <p className="bb-community-selection-location">
                          <span>⌖</span>
                          {location}
                        </p>
                      )}

                      <p className="bb-community-selection-description">
                        {community.description ||
                          "A verified BloodBridge donor community supporting local blood donation coordination."}
                      </p>

                      <div className="bb-community-selection-metrics">
                        <div>
                          <strong>
                            ★ {rating > 0 ? rating.toFixed(1) : "New"}
                          </strong>
                          <span>
                            {community.review_count || 0} reviews
                          </span>
                        </div>

                        <div>
                          <strong>
                            {community.member_count || 0}
                          </strong>
                          <span>members</span>
                        </div>
                      </div>
                    </div>

                    <div className="bb-community-selection-card-actions">
                      <button
                        type="button"
                        className="bb-community-selection-details-button"
                        onClick={() => handleViewDetails(community)}
                        disabled={joiningId !== null}
                      >
                        View details
                      </button>

                      <button
                        type="button"
                        className="bb-community-selection-join-button"
                        onClick={() =>
                          handleJoinCommunity(community.id)
                        }
                        disabled={joiningId !== null}
                      >
                        {joiningId === community.id
                          ? "Sending..."
                          : "Join community"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        <footer className="bb-community-selection-footer">
          <span>
            Your donor profile remains protected throughout
            onboarding.
          </span>

          <span>BloodBridge · Every drop connects a life.</span>
        </footer>
      </div>

      {selectedCommunity && (
        <div
          className="bb-community-selection-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <section
            className="bb-community-selection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-detail-title"
          >
            <header className="bb-community-selection-modal-header">
              <div>
                <span>COMMUNITY DETAILS</span>
                <h2 id="community-detail-title">
                  {selectedCommunity.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeDetails}
                aria-label="Close community details"
              >
                ×
              </button>
            </header>

            <div className="bb-community-selection-modal-body">
              {detailsLoading ? (
                <div className="bb-community-selection-modal-loading">
                  Loading community details...
                </div>
              ) : (
                <>
                  <div className="bb-community-selection-modal-summary">
                    <CommunityLogo community={selectedCommunity} />

                    <div>
                      <strong>
                        {selectedCommunity.name}
                      </strong>

                      {getCommunityLocation(selectedCommunity) && (
                        <span>
                          {getCommunityLocation(selectedCommunity)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bb-community-selection-modal-stats">
                    <div>
                      <strong>
                        ★{" "}
                        {Number(
                          selectedCommunity.rating || 0
                        ) > 0
                          ? Number(
                              selectedCommunity.rating
                            ).toFixed(1)
                          : "New"}
                      </strong>
                      <span>Rating</span>
                    </div>

                    <div>
                      <strong>
                        {selectedCommunity.review_count || 0}
                      </strong>
                      <span>Reviews</span>
                    </div>

                    <div>
                      <strong>
                        {selectedCommunity.member_count || 0}
                      </strong>
                      <span>Members</span>
                    </div>
                  </div>

                  <div className="bb-community-selection-modal-section">
                    <h3>About this community</h3>
                    <p>
                      {selectedCommunity.description ||
                        "No community description has been provided yet."}
                    </p>
                  </div>

                  {selectedCommunity.reviews?.length > 0 && (
                    <div className="bb-community-selection-modal-section">
                      <h3>Member reviews</h3>

                      <div className="bb-community-selection-reviews">
                        {selectedCommunity.reviews.map((review) => (
                          <div
                            className="bb-community-selection-review"
                            key={review.id}
                          >
                            <div>
                              <strong>
                                {review.donor_name || "Donor"}
                              </strong>

                              <span>
                                {"★".repeat(review.rating)}
                              </span>
                            </div>

                            {review.review && (
                              <p>{review.review}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <footer className="bb-community-selection-modal-footer">
              <button
                type="button"
                className="bb-community-selection-details-button"
                onClick={closeDetails}
                disabled={joiningId !== null}
              >
                Close
              </button>

              <button
                type="button"
                className="bb-community-selection-join-button"
                onClick={() =>
                  handleJoinCommunity(selectedCommunity.id)
                }
                disabled={detailsLoading || joiningId !== null}
              >
                {joiningId === selectedCommunity.id
                  ? "Sending..."
                  : "Join this community"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
