import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../api";
import { auth } from "../firebase";

export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readingIds, setReadingIds] = useState([]);

  const notificationsRef = useRef([]);
  const unreadCountRef = useRef(0);
  const readingIdsRef = useRef(new Set());
  const locallyReadIdsRef = useRef(new Set());
  const activeUserIdRef = useRef(auth.currentUser?.uid || null);
  const mountedRef = useRef(false);

  const replaceNotifications = useCallback((nextNotifications) => {
    notificationsRef.current = nextNotifications;
    setNotifications(nextNotifications);
  }, []);

  const replaceUnreadCount = useCallback((nextCount) => {
    const safeCount = Math.max(0, Number(nextCount) || 0);
    unreadCountRef.current = safeCount;
    setUnreadCount(safeCount);
  }, []);

  const loadNotifications = useCallback(async (currentUser = auth.currentUser) => {
    if (!currentUser) {
      replaceNotifications([]);
      replaceUnreadCount(0);
      return;
    }

    const requestedUserId = currentUser.uid;
    setLoading(true);

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE_URL}/notifications/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Unable to load notifications.");
      }

      if (
        !mountedRef.current ||
        activeUserIdRef.current !== requestedUserId
      ) {
        return;
      }

      const serverNotifications = Array.isArray(data.results)
        ? data.results
        : [];
      const locallyReadIds = locallyReadIdsRef.current;
      const previousById = new Map(
        notificationsRef.current.map((item) => [String(item.id), item])
      );
      const mergedNotifications = serverNotifications.map((item) => ({
        ...item,
        is_read:
          Boolean(item.is_read) ||
          locallyReadIds.has(String(item.id)) ||
          Boolean(previousById.get(String(item.id))?.is_read),
      }));

      replaceNotifications(mergedNotifications);

      const serverUnreadCount = Math.max(0, Number(data.unread_count) || 0);
      const staleUnreadCount = serverNotifications.filter(
        (item) =>
          !item.is_read && locallyReadIds.has(String(item.id))
      ).length;
      replaceUnreadCount(serverUnreadCount - staleUnreadCount);
    } catch (error) {
      console.error("Notification loading failed:", error);
    } finally {
      if (
        mountedRef.current &&
        activeUserIdRef.current === requestedUserId
      ) {
        setLoading(false);
      }
    }
  }, [replaceNotifications, replaceUnreadCount]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const notificationKey = String(notificationId);
    const notification = notificationsRef.current.find(
      (item) => String(item.id) === notificationKey
    );

    if (
      !notification ||
      notification.is_read ||
      readingIdsRef.current.has(notificationKey)
    ) {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const requestedUserId = currentUser.uid;

    readingIdsRef.current.add(notificationKey);
    setReadingIds([...readingIdsRef.current]);

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(
        `${API_BASE_URL}/notifications/${notificationId}/read/`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Unable to mark notification as read.");
      }

      if (
        !mountedRef.current ||
        activeUserIdRef.current !== requestedUserId
      ) {
        return;
      }

      locallyReadIdsRef.current.add(notificationKey);
      const nextNotifications = notificationsRef.current.map((item) =>
        String(item.id) === notificationKey
          ? { ...item, is_read: true, read_at: data.read_at || item.read_at }
          : item
      );
      replaceNotifications(nextNotifications);
      replaceUnreadCount(unreadCountRef.current - 1);
    } catch (error) {
      console.error("Mark-as-read failed:", error);
    } finally {
      readingIdsRef.current.delete(notificationKey);
      if (
        mountedRef.current &&
        activeUserIdRef.current === requestedUserId
      ) {
        setReadingIds([...readingIdsRef.current]);
      }
    }
  }, [replaceNotifications, replaceUnreadCount]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      const nextUserId = currentUser?.uid || null;
      if (activeUserIdRef.current !== nextUserId) {
        activeUserIdRef.current = nextUserId;
        locallyReadIdsRef.current.clear();
        readingIdsRef.current.clear();
        setReadingIds([]);
        replaceNotifications([]);
        replaceUnreadCount(0);
      }
      if (currentUser) loadNotifications(currentUser);
      else setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [loadNotifications, replaceNotifications, replaceUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    readingIds,
    loadNotifications,
    markNotificationRead,
  };
}
