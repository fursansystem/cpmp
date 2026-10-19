import { Bell, Check, CheckCheck, Trash2, Info, AlertCircle, CheckCircle, AlertTriangle, FileText, UserPlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/use-notifications";
import { Link } from "wouter";
import type { Notification } from "@shared/schema";

const notificationTypeConfig: Record<string, { icon: typeof Bell; className: string; label: string }> = {
  info: { icon: Info, className: "text-blue-500", label: "Info" },
  success: { icon: CheckCircle, className: "text-green-500", label: "Success" },
  warning: { icon: AlertTriangle, className: "text-yellow-500", label: "Warning" },
  error: { icon: AlertCircle, className: "text-red-500", label: "Error" },
  assignment: { icon: UserPlus, className: "text-purple-500", label: "Assignment" },
  status_change: { icon: RefreshCw, className: "text-orange-500", label: "Status Change" },
  approval: { icon: Check, className: "text-green-600", label: "Approval" },
  mention: { icon: Bell, className: "text-blue-600", label: "Mention" },
  document: { icon: FileText, className: "text-indigo-500", label: "Document" },
};

function NotificationIcon({ type }: { type: string }) {
  const config = notificationTypeConfig[type] || notificationTypeConfig.info;
  const Icon = config.icon;
  return <Icon className={`h-5 w-5 ${config.className}`} />;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} mins ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US");
}

function NotificationCard({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const config = notificationTypeConfig[notification.type] || notificationTypeConfig.info;

  const content = (
    <Card className={`transition-all ${!notification.isRead ? "border-l-4 border-l-primary" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full bg-muted`}>
            <NotificationIcon type={notification.type} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h4 className={`font-medium ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                  {notification.title}
                </h4>
                {!notification.isRead && (
                  <Badge variant="default" className="text-xs">NEW</Badge>
                )}
              </div>
              <Badge variant="outline" className="text-xs">{config.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
            <p className="text-xs text-muted-foreground mt-2">{formatTimeAgo(notification.createdAt)}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {!notification.isRead && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkAsRead(notification.id);
                }}
                data-testid={`button-mark-read-${notification.id}`}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(notification.id);
              }}
              data-testid={`button-delete-${notification.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (notification.link) {
    return (
      <Link href={notification.link}>
        <span className="block cursor-pointer">{content}</span>
      </Link>
    );
  }

  return content;
}

export default function Notifications() {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    isMarkingAllAsRead,
  } = useNotifications();

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold font-display">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notifications` : "No new notifications"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllAsRead()}
              disabled={isMarkingAllAsRead}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => deleteAllNotifications()}
              data-testid="button-delete-all"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bell className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm">Notifications will appear here when there are new updates</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={markAsRead}
              onDelete={deleteNotification}
            />
          ))}
        </div>
      )}
    </div>
  );
}
