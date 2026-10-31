
import { useState } from "react";
import { auth } from "../../firebase";
import { showToast } from "../../App";
import "./Settings.css";

const STORAGE_KEY = "bloodbridge-admin-settings";

const defaultSettings = {
    compactMode: false,
    emailNotifications: true,
    inAppNotifications: true,
    verificationAlerts: true,
    bloodRequestAlerts: true,
    securityAlerts: true,
    language: "en",
    timeZone: "Asia/Kolkata",
    dateFormat: "DD MMM YYYY",
    timeFormat: "12h",
};

function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) return { ...defaultSettings };
        const parsed = JSON.parse(saved);
        const preferences = Object.fromEntries(
            Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(defaultSettings, key))
        );
        const normalized = { ...defaultSettings, ...preferences };
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        }
        return normalized;
    } catch {
        return { ...defaultSettings };
    }
}

function Toggle({ label, description, checked, onChange }) {
    return (
        <label className="bb-settings-toggle-row">
            <span className="bb-settings-toggle-copy">
                <strong>{label}</strong>
                <span>{description}</span>
            </span>

            <input
                className="bb-settings-toggle-input"
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />

            <span className="bb-settings-switch" aria-hidden="true" />
        </label>
    );
}

export default function Settings() {
    const [settings, setSettings] = useState(loadSettings);
    const [savedSettings, setSavedSettings] = useState(loadSettings);
    const [activeSection, setActiveSection] = useState("layout");

    const user = auth.currentUser;
    const hasChanges =
        JSON.stringify(settings) !== JSON.stringify(savedSettings);

    const updateSetting = (key, value) => {
        setSettings((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const saveSettings = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

            setSavedSettings({ ...settings });
            showToast("Settings saved successfully.");
        } catch {
            showToast("Unable to save settings in this browser.");
        }
    };

    const resetSettings = () => {
  const defaults = { ...defaultSettings };

  setSettings(defaults);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    setSavedSettings({ ...defaults });

    showToast("Settings restored to defaults.");
  } catch {
    showToast("Unable to save the default settings.");
  }
};
    const sections = [
        { id: "layout", icon: "▤", label: "Layout" },
        { id: "notifications", icon: "♧", label: "Notifications" },
        { id: "security", icon: "◇", label: "Security" },
        { id: "regional", icon: "◎", label: "Regional preferences" },
    ];

    return (
        <section
            className={`bb-settings-page ${settings.compactMode ? "bb-settings-compact" : ""}`}
        >
            <div className="bb-settings-heading">
                <div>
                    <div className="bb-settings-breadcrumb">
                        Administration <span>/</span> Settings
                    </div>

                    <h1>Settings</h1>

                    <p>
                        Personalize your workspace and manage your administrative
                        preferences.
                    </p>
                </div>

                <span className="bb-settings-status">
                    <span /> Preferences
                </span>
            </div>

            <div className="bb-settings-layout">
                <aside className="bb-settings-nav">
                    <span className="bb-settings-nav-heading">PREFERENCES</span>

                    {sections.map((section) => (
                        <button
                            type="button"
                            key={section.id}
                            className={`bb-settings-nav-item ${activeSection === section.id ? "active" : ""
                                }`}
                            onClick={() => {
                                setActiveSection(section.id);
                                document
                                    .getElementById(`settings-${section.id}`)
                                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                        >
                            <span className="bb-settings-nav-icon">{section.icon}</span>
                            <span>{section.label}</span>
                            <span className="bb-settings-nav-arrow">›</span>
                        </button>
                    ))}

                    <div className="bb-settings-help">
                        <span className="bb-settings-help-icon">♥</span>
                        <strong>BloodBridge</strong>
                        <p>
                            Every drop matters. Your preferences help make your workspace
                            work for you.
                        </p>
                    </div>
                </aside>

                <div className="bb-settings-content">
                    <section
                        className="bb-settings-card"
                        id="settings-layout"
                    >
                        <div className="bb-settings-card-heading">
                            <span className="bb-settings-section-icon">▤</span>
                            <div>
                                <h2>Layout</h2>
                                <p>Adjust the spacing of your administrative workspace.</p>
                            </div>
                        </div>

                        <Toggle
                            label="Compact layout"
                            description="Reduce spacing between elements on this page."
                            checked={settings.compactMode}
                            onChange={(value) => updateSetting("compactMode", value)}
                        />
                    </section>

                    <section
                        className="bb-settings-card"
                        id="settings-notifications"
                    >
                        <div className="bb-settings-card-heading">
                            <span className="bb-settings-section-icon">♧</span>
                            <div>
                                <h2>Notifications</h2>
                                <p>Choose which notification preferences to keep enabled.</p>
                            </div>
                        </div>

                        <div className="bb-settings-group-label">DELIVERY CHANNELS</div>

                        <Toggle
                            label="Email notifications"
                            description="Preference for receiving supported alerts by email."
                            checked={settings.emailNotifications}
                            onChange={(value) =>
                                updateSetting("emailNotifications", value)
                            }
                        />

                        <Toggle
                            label="In-app notifications"
                            description="Preference for alerts displayed inside BloodBridge."
                            checked={settings.inAppNotifications}
                            onChange={(value) =>
                                updateSetting("inAppNotifications", value)
                            }
                        />

                        <div className="bb-settings-divider" />

                        <div className="bb-settings-group-label">ALERT CATEGORIES</div>

                        <Toggle
                            label="Verification alerts"
                            description="Hospital and community verification updates."
                            checked={settings.verificationAlerts}
                            onChange={(value) =>
                                updateSetting("verificationAlerts", value)
                            }
                        />

                        <Toggle
                            label="Blood request alerts"
                            description="Updates related to blood request activity."
                            checked={settings.bloodRequestAlerts}
                            onChange={(value) =>
                                updateSetting("bloodRequestAlerts", value)
                            }
                        />

                        <Toggle
                            label="Security alerts"
                            description="Important account and security notifications."
                            checked={settings.securityAlerts}
                            onChange={(value) => updateSetting("securityAlerts", value)}
                        />
                    </section>

                    <section className="bb-settings-card" id="settings-security">
                        <div className="bb-settings-card-heading">
                            <span className="bb-settings-section-icon">◇</span>
                            <div>
                                <h2>Security & account</h2>
                                <p>Review your current account and authentication status.</p>
                            </div>
                        </div>

                        <div className="bb-settings-account">
                            <div className="bb-settings-account-avatar">
                                {(user?.displayName || user?.email || "A")
                                    .charAt(0)
                                    .toUpperCase()}
                            </div>

                            <div className="bb-settings-account-copy">
                                <strong>
                                    {user?.displayName ||
                                        user?.email?.split("@")[0] ||
                                        "Administrator"}
                                </strong>
                                <span>{user?.email || "No signed-in email available"}</span>
                                <span className="bb-settings-role">Super Admin</span>
                            </div>

                            <span className="bb-settings-auth-badge">
                                {user ? "Signed in" : "Not signed in"}
                            </span>
                        </div>

                        <div className="bb-settings-security-note">
                            <span>i</span>
                            <p>
                                Authentication is managed by Firebase. Password changes,
                                account recovery and session revocation should use the
                                existing authentication flow.
                            </p>
                        </div>

                        <div className="bb-settings-info-row">
                            <span>Audit log retention</span>
                            <strong>365 days (configured policy)</strong>
                        </div>
                    </section>

                    <section
                        className="bb-settings-card"
                        id="settings-regional"
                    >
                        <div className="bb-settings-card-heading">
                            <span className="bb-settings-section-icon">◎</span>
                            <div>
                                <h2>Regional preferences</h2>
                                <p>Set your preferred date, time and language formats.</p>
                            </div>
                        </div>

                        <div className="bb-settings-form-grid">
                            <div className="bb-settings-field">
                                <label htmlFor="settings-language">Language</label>
                                <select
                                    id="settings-language"
                                    value={settings.language}
                                    onChange={(event) =>
                                        updateSetting("language", event.target.value)
                                    }
                                >
                                    <option value="en">English</option>
                                </select>
                                <span className="bb-settings-field-hint">
                                    Additional languages can be added when translations are
                                    available.
                                </span>
                            </div>

                            <div className="bb-settings-field">
                                <label htmlFor="settings-timezone">Time zone</label>
                                <select
                                    id="settings-timezone"
                                    value={settings.timeZone}
                                    onChange={(event) =>
                                        updateSetting("timeZone", event.target.value)
                                    }
                                >
                                    <option value="Asia/Kolkata">
                                        India Standard Time (UTC+05:30)
                                    </option>
                                    <option value="UTC">UTC</option>
                                </select>
                            </div>

                            <div className="bb-settings-field">
                                <label htmlFor="settings-date">Date format</label>
                                <select
                                    id="settings-date"
                                    value={settings.dateFormat}
                                    onChange={(event) =>
                                        updateSetting("dateFormat", event.target.value)
                                    }
                                >
                                    <option value="DD MMM YYYY">16 Oct 2026</option>
                                    <option value="DD/MM/YYYY">16/10/2026</option>
                                    <option value="MM/DD/YYYY">10/16/2026</option>
                                    <option value="YYYY-MM-DD">2026-10-16</option>
                                </select>
                            </div>

                            <div className="bb-settings-field">
                                <label htmlFor="settings-time">Time format</label>
                                <select
                                    id="settings-time"
                                    value={settings.timeFormat}
                                    onChange={(event) =>
                                        updateSetting("timeFormat", event.target.value)
                                    }
                                >
                                    <option value="12h">12-hour (2:30 PM)</option>
                                    <option value="24h">24-hour (14:30)</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <div className="bb-settings-actions">
                        <span>
                            {hasChanges
                                ? "You have unsaved changes."
                                : "Your preferences are up to date."}
                        </span>

                        <div>
                            <button
                                type="button"
                                className="bb-settings-reset"
                                onClick={resetSettings}
                            >
                                Reset defaults
                            </button>

                            <button
                                type="button"
                                className="bb-settings-save"
                                onClick={saveSettings}
                                disabled={!hasChanges}
                            >
                                Save changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
