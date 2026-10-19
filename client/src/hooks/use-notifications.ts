import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { triggerDesktopNotification } from "@/hooks/use-desktop-notifications";
import type { Notification } from "@shared/schema";

type RequestUpdateCallback = (data: { requestId: string; updateType: string }) => void;

// Shared WebSocket instance and subscribers
let sharedWs: WebSocket | null = null;
let requestUpdateCallbacks: Map<string, RequestUpdateCallback> = new Map();

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
    // The WebSocket below pushes new notifications in real time, so this poll is only a
    // fallback for a dropped socket. Anything under 5 minutes keeps the serverless database
    // permanently awake (its scale-to-zero timeout is 5 minutes) for no added benefit.
    refetchInterval: 5 * 60 * 1000,
  });

  const unreadCount = unreadCountData?.count ?? 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest("DELETE", `/api/notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/notifications");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const connectWebSocket = useCallback(() => {
    if (!user?.id) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    sharedWs = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "auth", userId: user.id }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "notification") {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
          if (user?.id && message.data) {
            const n = message.data;
            triggerDesktopNotification(
              user.id,
              n.title || "New Notification",
              n.message || "",
              n.type || "info",
              n.link || undefined
            );
          }
        } else if (message.type === "all_read") {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        } else if (message.type === "new_message") {
          const { requestId, message: msgData } = message.data;
          // Optimistically update the cache for the chat messages
          if (requestId && msgData) {
            queryClient.setQueryData(["/api/requests", requestId, "all-messages"], (old: any) => {
              const currentMessages = old || [];
              // Avoid duplicates (e.g. if sender receives their own broadcast)
              if (currentMessages.some((m: any) => m.id === msgData.id)) {
                return currentMessages;
              }
              return [...currentMessages, msgData];
            });
          }

          // Still invalidate to ensure synchronization
          if (requestId) {
            queryClient.invalidateQueries({
              queryKey: ["/api/requests", requestId, "all-messages"]
            });
          }
          // Also invalidate legacy revision-based messages query
          queryClient.invalidateQueries({
            queryKey: ["/api/revisions", message.data.revisionId, "messages"]
          });
        } else if (message.type === "request_updated") {
          // Invalidate cache for all request-related updates
          const validUpdateTypes = [
            "step_approved",
            "status_changed",
            "request_closed",
            "document_added",
            "approval_status",
            "data_changed"
          ];
          if (message.data?.requestId && validUpdateTypes.includes(message.data?.updateType)) {
            const requestId = message.data.requestId;
            // Invalidate the specific request
            queryClient.invalidateQueries({
              queryKey: ["/api/requests", requestId]
            });
            // Invalidate the requests list
            queryClient.invalidateQueries({
              queryKey: ["/api/requests"]
            });
            // Invalidate activities cache
            queryClient.invalidateQueries({
              queryKey: ["/api/activities"]
            });
            // Invalidate request revisions
            queryClient.invalidateQueries({
              queryKey: ["/api/requests", requestId, "revisions"]
            });
            // Invalidate request transitions
            queryClient.invalidateQueries({
              queryKey: ["/api/requests", requestId, "transitions"]
            });
            // Invalidate all revision-related queries (using predicate for flexibility)
            queryClient.invalidateQueries({
              predicate: (query) => {
                const key = query.queryKey;
                return Array.isArray(key) && key[0] === "/api/revisions";
              }
            });
          }
          // Notify all subscribers about request update
          requestUpdateCallbacks.forEach((callback) => {
            callback(message.data);
          });
        } else if (message.type === "project_updated") {
          const projectId = message.data?.projectId;
          if (projectId) {
            queryClient.invalidateQueries({
              queryKey: ["/api/activities", projectId]
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/requests", { projectId }]
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/tasks", projectId]
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/documents", projectId]
            });
          }
        } else if (message.type === "progress_matrix_updated") {
          // Progress matrix / payment certificates changed: refresh the project, its matrix and certificates
          const projectId = message.data?.projectId;
          if (projectId) {
            queryClient.invalidateQueries({
              queryKey: ["/api/projects", projectId]
            });
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Only reconnect if this is still the active websocket
      if (wsRef.current === ws) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
  }, [user?.id, queryClient]);

  useEffect(() => {
    if (user?.id) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        const wsToClose = wsRef.current;
        wsToClose.close();
        if (sharedWs === wsToClose) {
          sharedWs = null;
        }
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [user?.id, connectWebSocket]);

  // Subscribe to request updates for a specific request
  const subscribeToRequest = useCallback((requestId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe_request", requestId }));
    }
  }, []);

  // Unsubscribe from request updates
  const unsubscribeFromRequest = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe_request" }));
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    deleteNotification: deleteNotificationMutation.mutate,
    deleteAllNotifications: deleteAllNotificationsMutation.mutate,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    subscribeToRequest,
    unsubscribeFromRequest,
  };
}

// Hook for subscribing to request updates on a specific page
export function useRequestUpdates(
  requestId: string | undefined,
  onUpdate: (data: { requestId: string; updateType: string }) => void
) {
  const callbackId = useRef<string>(Math.random().toString(36).substring(7));

  useEffect(() => {
    if (!requestId) return;

    const id = callbackId.current;

    // Register the callback
    requestUpdateCallbacks.set(id, (data) => {
      if (data.requestId === requestId) {
        onUpdate(data);
      }
    });

    // Subscribe to this request via WebSocket
    if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
      sharedWs.send(JSON.stringify({ type: "subscribe_request", requestId }));
    }

    return () => {
      // Cleanup callback
      requestUpdateCallbacks.delete(id);

      // Unsubscribe from request
      if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
        sharedWs.send(JSON.stringify({ type: "unsubscribe_request" }));
      }
    };
  }, [requestId, onUpdate]);
}
