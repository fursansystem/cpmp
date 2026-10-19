import { useState } from "react";
import { Bell, Check, CheckCheck, Trash2, Info, AlertCircle, CheckCircle, AlertTriangle, FileText, UserPlus, RefreshCw, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotifications } from "@/hooks/use-notifications";
import { Link } from "wouter";
import type { Notification } from "@shared/schema";

const notificationTypeConfig: Record<string, { icon: typeof Bell; className: string }> = {
  info: { icon: Info, className: "text-blue-500" },
  success: { icon: CheckCircle, className: "text-green-500" },
  warning: { icon: AlertTriangle, className: "text-yellow-500" },
  error: { icon: AlertCircle, className: "text-red-500" },
  assignment: { icon: UserPlus, className: "text-purple-500" },
  status_change: { icon: RefreshCw, className: "text-orange-500" },
  approval: { icon: Check, className: "text-green-600" },
  mention: { icon: MessageSquare, className: "text-blue-600" },
  document: { icon: FileText, className: "text-indigo-500" },
  message: { icon: MessageSquare, className: "text-blue-500" },
};

const MESSAGE_TYPES = ["mention", "message"];

function NotificationIcon({ type }: { type: string }) {
  const config = notificationTypeConfig[type] || notificationTypeConfig.info;
  const Icon = config.icon;
  return <Icon className={`h-4 w-4 ${config.className}`} />;
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

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const content = (
    <div
      className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
        notification.isRead 
          ? "bg-transparent" 
          : "bg-primary/5"
      } hover-elevate`}
    >
      <NotificationIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium truncate ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(notification.createdAt)}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {!notification.isRead && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMarkAsRead(notification.id);
            }}
            data-testid={`button-mark-read-${notification.id}`}
          >
            <Check className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(notification.id);
          }}
          data-testid={`button-delete-notification-${notification.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
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

function EmptyState({ type }: { type: "notifications" | "messages" }) {
  const Icon = type === "messages" ? MessageSquare : Bell;
  const text = type === "messages" ? "No messages" : "No notifications";
  
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Icon className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function NotificationList({
  notifications,
  isLoading,
  onMarkAsRead,
  onDelete,
  emptyType,
}: {
  notifications: Notification[];
  isLoading: boolean;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  emptyType: "notifications" | "messages";
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return <EmptyState type={emptyType} />;
  }

  return (
    <div className="p-1 space-y-1">
      {notifications.slice(0, 10).map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export function NotificationCenter() {
  const [activeTab, setActiveTab] = useState<"notifications" | "messages">("notifications");
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

  const generalNotifications = notifications.filter(
    (n) => !MESSAGE_TYPES.includes(n.type)
  );
  const messageNotifications = notifications.filter(
    (n) => MESSAGE_TYPES.includes(n.type)
  );

  const unreadGeneralCount = generalNotifications.filter((n) => !n.isRead).length;
  const unreadMessagesCount = messageNotifications.filter((n) => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative h-9 w-9 rounded-md hover:bg-transparent hover:text-primary transition-all"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "notifications" | "messages")} className="w-full">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <TabsList className="h-8">
              <TabsTrigger value="notifications" className="text-xs px-3 relative" data-testid="tab-notifications">
                Notifications
                {unreadGeneralCount > 0 && (
                  <Badge variant="secondary" className="h-4 w-4 p-0 text-[10px] ml-1 flex items-center justify-center">
                    {unreadGeneralCount > 9 ? "9+" : unreadGeneralCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="text-xs px-3 relative" data-testid="tab-messages">
                Messages
                {unreadMessagesCount > 0 && (
                  <Badge variant="secondary" className="h-4 w-4 p-0 text-[10px] ml-1 flex items-center justify-center">
                    {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllAsRead()}
                disabled={isMarkingAllAsRead}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all
              </Button>
            )}
          </div>

          <TabsContent value="notifications" className="m-0">
            <ScrollArea className="h-[280px]">
              <NotificationList
                notifications={generalNotifications}
                isLoading={isLoading}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                emptyType="notifications"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="messages" className="m-0">
            <ScrollArea className="h-[280px]">
              <NotificationList
                notifications={messageNotifications}
                isLoading={isLoading}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                emptyType="messages"
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 flex justify-between">
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="text-xs" data-testid="link-view-all-notifications">
                  View all
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => deleteAllNotifications()}
                data-testid="button-delete-all-notifications"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear all
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
