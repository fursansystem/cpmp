import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { Notification } from "@shared/schema";

interface WebSocketClient extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  viewingRequestId?: string;
}

class NotificationWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocketClient>> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws/notifications" });

    this.wss.on("connection", (ws: WebSocketClient) => {
      ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "auth" && data.userId) {
            ws.userId = data.userId;
            if (!this.clients.has(data.userId)) {
              this.clients.set(data.userId, new Set());
            }
            this.clients.get(data.userId)!.add(ws);
            ws.send(JSON.stringify({ type: "auth_success" }));
          } else if (data.type === "subscribe_request" && data.requestId) {
            ws.viewingRequestId = data.requestId;
          } else if (data.type === "unsubscribe_request") {
            ws.viewingRequestId = undefined;
          }
        } catch (e) {
          console.error("WebSocket message parse error:", e);
        }
      });

      ws.on("close", () => {
        if (ws.userId && this.clients.has(ws.userId)) {
          this.clients.get(ws.userId)!.delete(ws);
          if (this.clients.get(ws.userId)!.size === 0) {
            this.clients.delete(ws.userId);
          }
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });
    });

    const interval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on("close", () => {
      clearInterval(interval);
    });

    console.log("WebSocket server initialized for notifications");
  }

  sendNotification(userId: string, notification: Notification) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const message = JSON.stringify({
        type: "notification",
        data: notification,
      });
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  broadcastToUser(userId: string, message: { type: string; data?: any }) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const messageStr = JSON.stringify(message);
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageStr);
        }
      });
    }
  }

  // Broadcast to all connected users (except the sender) for cache invalidation
  broadcastRequestUpdate(requestId: string, excludeUserId?: string, updateType?: string) {
    const message = JSON.stringify({
      type: "request_updated",
      data: { requestId, updateType: updateType || "data_changed" },
    });
    
    this.clients.forEach((clientSet, userId) => {
      if (excludeUserId && userId === excludeUserId) return;
      
      clientSet.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
  }

  // Broadcast to all users currently viewing a specific project (except the sender)
  broadcastProjectUpdate(projectId: string, excludeUserId?: string) {
    const message = JSON.stringify({
      type: "project_updated",
      data: { projectId },
    });
    
    this.wss?.clients.forEach((ws: WebSocketClient) => {
      if (ws.userId && excludeUserId && ws.userId === excludeUserId) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Progress matrix / payment certificates changed for a project (except the sender)
  broadcastProgressMatrixUpdate(projectId: string, excludeUserId?: string) {
    const message = JSON.stringify({
      type: "progress_matrix_updated",
      data: { projectId },
    });

    this.wss?.clients.forEach((ws: WebSocketClient) => {
      if (ws.userId && excludeUserId && ws.userId === excludeUserId) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Broadcast to all users currently viewing a specific request (the "real-time" way)
  broadcastToRequestViewers(requestId: string, message: { type: string; data?: any }) {
    const messageStr = JSON.stringify(message);
    this.wss?.clients.forEach((ws: WebSocketClient) => {
      if (ws.readyState === WebSocket.OPEN && ws.viewingRequestId === requestId) {
        ws.send(messageStr);
      }
    });
  }

  // Check if a user is currently viewing a specific request
  isUserViewingRequest(userId: string, requestId: string): boolean {
    const userClients = this.clients.get(userId);
    if (!userClients) return false;
    
    const clientsArr = Array.from(userClients);
    for (const client of clientsArr) {
      if (client.readyState === WebSocket.OPEN && client.viewingRequestId === requestId) {
        return true;
      }
    }
    return false;
  }
}

export const notificationWss = new NotificationWebSocketServer();

export const broadcastActivityUpdate = (activity: any) => {
  notificationWss.broadcastProjectUpdate(activity.projectId);
};
