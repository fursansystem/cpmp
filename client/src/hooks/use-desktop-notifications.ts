import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth";

export interface DesktopNotificationSettings {
  enabled: boolean;
  statusChanges: boolean;
  assignments: boolean;
  messages: boolean;
}

const DEFAULT_SETTINGS: DesktopNotificationSettings = {
  enabled: false,
  statusChanges: true,
  assignments: true,
  messages: true,
};

function getStorageKey(userId: string) {
  return `desktop-notification-settings-${userId}`;
}

function loadSettings(userId: string): DesktopNotificationSettings {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(userId: string, settings: DesktopNotificationSettings) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(settings));
}

export function useDesktopNotifications() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DesktopNotificationSettings>(DEFAULT_SETTINGS);
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (user?.id) {
      setSettings(loadSettings(user.id));
    }
    if ("Notification" in window) {
      setPermissionState(Notification.permission);
    }
  }, [user?.id]);

  const updateSetting = useCallback(
    (key: keyof DesktopNotificationSettings, value: boolean) => {
      if (!user?.id) return;
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveSettings(user.id, next);
        return next;
      });
    },
    [user?.id]
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") {
      setPermissionState("granted");
      return true;
    }
    if (Notification.permission === "denied") {
      setPermissionState("denied");
      return false;
    }
    const result = await Notification.requestPermission();
    setPermissionState(result);
    return result === "granted";
  }, []);

  const toggleEnabled = useCallback(
    async (value: boolean) => {
      if (value) {
        const granted = await requestPermission();
        if (!granted) return;
      }
      updateSetting("enabled", value);
    },
    [requestPermission, updateSetting]
  );

  const showDesktopNotification = useCallback(
    (title: string, body: string, notificationType: string, link?: string) => {
      if (!settings.enabled) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      const statusTypes = ["status_change", "approval"];
      const assignmentTypes = ["assignment"];
      const messageTypes = ["mention", "message"];

      if (statusTypes.includes(notificationType) && !settings.statusChanges) return;
      if (assignmentTypes.includes(notificationType) && !settings.assignments) return;
      if (messageTypes.includes(notificationType) && !settings.messages) return;

      const notification = new Notification(title, {
        body,
        icon: "/favicon.ico",
        silent: true,
        tag: `pm-${Date.now()}`,
      });

      notification.onclick = () => {
        window.focus();
        if (link) {
          window.location.href = link;
        }
        notification.close();
      };

      setTimeout(() => notification.close(), 6000);
    },
    [settings]
  );

  return {
    settings,
    permissionState,
    toggleEnabled,
    updateSetting,
    showDesktopNotification,
  };
}

export function triggerDesktopNotification(
  userId: string,
  title: string,
  body: string,
  notificationType: string,
  link?: string
) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const settings = loadSettings(userId);
  if (!settings.enabled) return;

  const statusTypes = ["status_change", "approval"];
  const assignmentTypes = ["assignment"];
  const messageTypes = ["mention", "message"];

  if (statusTypes.includes(notificationType) && !settings.statusChanges) return;
  if (assignmentTypes.includes(notificationType) && !settings.assignments) return;
  if (messageTypes.includes(notificationType) && !settings.messages) return;

  const notification = new Notification(title, {
    body,
    icon: "/favicon.ico",
    silent: true,
    tag: `pm-${Date.now()}`,
  });

  notification.onclick = () => {
    window.focus();
    if (link) {
      window.location.href = link;
    }
    notification.close();
  };

  setTimeout(() => notification.close(), 6000);
}
