import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useNotifications from "../hooks/useNotifications";

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    readingIds,
    loadNotifications,
    markNotificationRead,
  } = useNotifications();

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const openNotifications = () => {
    setIsOpen(true);
    loadNotifications();
  };

  return (
    <>
      <button
        type="button"
        className="bb-admin-notification-button"
        aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={openNotifications}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="bb-admin-notification-count" aria-live="polite">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        createPortal(
          <div
            className="bb-notification-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false);
            }}
          >
            <section
              className="bb-notification-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bb-notification-title"
            >
              <header className="bb-notification-modal-header">
                <div>
                  <h2 id="bb-notification-title">Notifications</h2>
                  <p>You have {unreadCount} unread notifications</p>
                </div>
                <button
                  type="button"
                  className="bb-notification-close"
                  aria-label="Close notifications"
                  onClick={() => setIsOpen(false)}
                >
                  ×
                </button>
              </header>

              <div className="bb-notification-modal-body">
                {loading ? (
                  <p className="bb-notification-empty" role="status">
                    Loading notifications...
                  </p>
                ) : notifications.length === 0 ? (
                  <div className="bb-notification-empty">
                    <span className="bb-notification-empty-icon" aria-hidden="true">
                      ♧
                    </span>
                    <h3>You're all caught up!</h3>
                    <p>New notifications will appear here.</p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const isReading = readingIds.includes(String(notification.id));
                    return (
                      <button
                        type="button"
                        key={notification.id}
                        className={`bb-notification-row${notification.is_read ? "" : " is-unread"}`}
                        aria-busy={isReading}
                        disabled={isReading}
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        <span className="bb-notification-dot" aria-hidden="true" />
                        <span className="bb-notification-content">
                          <strong>{notification.title}</strong>
                          <span>{notification.message}</span>
                          <small>
                            {new Date(notification.created_at).toLocaleString("en-IN")}
                          </small>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <footer className="bb-notification-modal-footer">
                <button
                  type="button"
                  className="bb-notification-done"
                  onClick={() => setIsOpen(false)}
                >
                  Done
                </button>
              </footer>
            </section>
          </div>,
          document.body
        )
      )}
    </>
  );
}
