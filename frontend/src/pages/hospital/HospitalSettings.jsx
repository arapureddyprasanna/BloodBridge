import { useEffect, useState } from "react";
import "../admin/Settings.css";

function HospitalSettings() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [requestAlerts, setRequestAlerts] = useState(true);
  const [donorResponseAlerts, setDonorResponseAlerts] = useState(true);
  const [communityAlerts, setCommunityAlerts] = useState(true);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedEmail =
      localStorage.getItem("bb-hospital-email-notifications");

    const savedRequests =
      localStorage.getItem("bb-hospital-request-alerts");

    const savedDonorResponses =
      localStorage.getItem("bb-hospital-donor-response-alerts");

    const savedCommunity =
      localStorage.getItem("bb-hospital-community-alerts");

    if (savedEmail !== null) {
      setEmailNotifications(savedEmail === "true");
    }

    if (savedRequests !== null) {
      setRequestAlerts(savedRequests === "true");
    }

    if (savedDonorResponses !== null) {
      setDonorResponseAlerts(savedDonorResponses === "true");
    }

    if (savedCommunity !== null) {
      setCommunityAlerts(savedCommunity === "true");
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(
      "bb-hospital-email-notifications",
      String(emailNotifications)
    );
    localStorage.setItem(
      "bb-hospital-request-alerts",
      String(requestAlerts)
    );
    localStorage.setItem(
      "bb-hospital-donor-response-alerts",
      String(donorResponseAlerts)
    );
    localStorage.setItem(
      "bb-hospital-community-alerts",
      String(communityAlerts)
    );

    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <div className="bb-settings-page">
      <div className="bb-settings-heading">
        <div>
          <div className="bb-settings-breadcrumb">
            <span>Hospital</span>
            <span>/</span>
            Settings
          </div>

          <h1>Settings</h1>

          <p>
            Manage your hospital dashboard preferences and
            notification settings.
          </p>
        </div>

        <div className="bb-settings-status">
          <span />
          Settings
        </div>
      </div>

      <div className="bb-settings-layout">
        <aside className="bb-settings-nav">
          <div className="bb-settings-nav-heading">
            SETTINGS
          </div>

          <div className="bb-settings-group-label">
            PREFERENCES
          </div>

          <button
            type="button"
            className="bb-settings-nav-item active"
          >
            <span className="bb-settings-nav-icon">♢</span>
            <span>Notifications</span>
            <span className="bb-settings-nav-arrow">
              ›
            </span>
          </button>

          <div className="bb-settings-help">
            <div className="bb-settings-help-icon">?</div>

            <strong>Need help?</strong>

            <p>
              Contact the BloodBridge support team if you
              need assistance.
            </p>
          </div>
        </aside>

        <main className="bb-settings-content">
          <section className="bb-settings-card">
            <div className="bb-settings-card-heading">
              <div className="bb-settings-section-icon">
                ♢
              </div>

              <div>
                <h2>Notifications</h2>

                <p>
                  Choose which hospital activity
                  notifications you want to receive.
                </p>
              </div>
            </div>

            <div className="bb-settings-toggle-row">
              <div className="bb-settings-toggle-copy">
                <strong>Email Notifications</strong>

                <span>
                  Receive important BloodBridge
                  notifications by email.
                </span>
              </div>

              <label className="bb-settings-switch">
                <input
                  className="bb-settings-toggle-input"
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(event) =>
                    setEmailNotifications(
                      event.target.checked
                    )
                  }
                />
                <span />
              </label>
            </div>

            <div className="bb-settings-toggle-row">
              <div className="bb-settings-toggle-copy">
                <strong>Blood Request Alerts</strong>

                <span>
                  Get notified about important updates to
                  your blood requests.
                </span>
              </div>

              <label className="bb-settings-switch">
                <input
                  className="bb-settings-toggle-input"
                  type="checkbox"
                  checked={requestAlerts}
                  onChange={(event) =>
                    setRequestAlerts(event.target.checked)
                  }
                />
                <span />
              </label>
            </div>

            <div className="bb-settings-toggle-row">
              <div className="bb-settings-toggle-copy">
                <strong>Donor Response Alerts</strong>

                <span>
                  Get notified when selected donors respond
                  to your requests.
                </span>
              </div>

              <label className="bb-settings-switch">
                <input
                  className="bb-settings-toggle-input"
                  type="checkbox"
                  checked={donorResponseAlerts}
                  onChange={(event) =>
                    setDonorResponseAlerts(
                      event.target.checked
                    )
                  }
                />
                <span />
              </label>
            </div>

            <div className="bb-settings-toggle-row">
              <div className="bb-settings-toggle-copy">
                <strong>Community Alerts</strong>

                <span>
                  Receive updates from communities
                  coordinating your blood requests.
                </span>
              </div>

              <label className="bb-settings-switch">
                <input
                  className="bb-settings-toggle-input"
                  type="checkbox"
                  checked={communityAlerts}
                  onChange={(event) =>
                    setCommunityAlerts(
                      event.target.checked
                    )
                  }
                />
                <span />
              </label>
            </div>
          </section>

          <section className="bb-settings-card">
            <div className="bb-settings-card-heading">
              <div className="bb-settings-section-icon">
                ✓
              </div>

              <div>
                <h2>Preferences</h2>

                <p>
                  These preferences control your hospital
                  workspace experience.
                </p>
              </div>
            </div>

            <div className="bb-settings-info-row">
              <span>Account notifications</span>
              <strong>
                {emailNotifications ? "Enabled" : "Disabled"}
              </strong>
            </div>

            <div className="bb-settings-info-row">
              <span>Request alerts</span>
              <strong>
                {requestAlerts ? "Enabled" : "Disabled"}
              </strong>
            </div>

            <div className="bb-settings-info-row">
              <span>Donor response alerts</span>
              <strong>
                {donorResponseAlerts
                  ? "Enabled"
                  : "Disabled"}
              </strong>
            </div>

            <div className="bb-settings-info-row">
              <span>Community alerts</span>
              <strong>
                {communityAlerts ? "Enabled" : "Disabled"}
              </strong>
            </div>

            <div className="bb-settings-actions">
              <span>
                {saved
                  ? "Your settings have been saved."
                  : "Save your changes when you are finished."}
              </span>

              <div>
                <button
                  type="button"
                  className="bb-settings-save"
                  onClick={handleSave}
                >
                  {saved ? "Saved" : "Save Changes"}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default HospitalSettings;
