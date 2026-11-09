import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check, CheckCheck, Trash2, Info, AlertCircle, CheckCircle, AlertTriangle, FileText, UserPlus, RefreshCw, MessageSquare, Volume2, VolumeX, Hourglass } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { isSoundMuted, setSoundMuted } from "@/lib/notification-sound";
import { Link } from "wouter";
import type { Notification } from "@shared/schema";
import { timeAgo } from "@/lib/i18n-format";

const notificationTypeConfig: Record<string, { icon: typeof Bell; className: string }> = {
  info: { icon: Info, className: "text-blue-500" },
  success: { icon: CheckCircle, className: "text-green-500" },
  warning: { icon: AlertTriangle, className: "text-yellow-500" },
  error: { icon: AlertCircle, className: "text-red-500" },
  assignment: { icon: UserPlus, className: "text-purple-500" },
  status_change: { icon: RefreshCw, className: "text-orange-500" },
  // waiting for a decision: an hourglass, so it is not mistaken for the "mark as read" tick
  approval: { icon: Hourglass, className: "text-amber-600" },
  mention: { icon: MessageSquare, className: "text-blue-600" },
  document: { icon: FileText, className: "text-indigo-500" },
  message: { icon: MessageSquare, className: "text-blue-500" },
};

const MESSAGE_TYPES = ["mention", "message"];

function NotificationIcon({ type, link, title }: { type: string; link?: string | null; title?: string }) {
  const config = notificationTypeConfig[type] || notificationTypeConfig.info;
  // Anything about bill documents (أصول الفواتير) shows a document, whatever type it was sent with
  const isBills = (link ?? "").startsWith("/payments?tab=bills");
  // A payments item waiting for you (sent as an assignment) shows the same hourglass as the other items awaiting a decision
  const inPayments = (link ?? "").startsWith("/payments?");
  // Sent back, rejected or cancelled: a warning, even though it was sent as an assignment
  const sentBack = !isBills && type === "assignment" && inPayments && /مرفوض|رُفض|معاد|أُعيد|أُلغي|rejected|returned|cancelled/i.test(title ?? "");
  const waiting = !isBills && !sentBack && type === "assignment" && inPayments;
  const Icon = isBills ? FileText : sentBack ? AlertTriangle : waiting ? Hourglass : config.icon;
  return <Icon className={`h-4 w-4 ${sentBack ? "text-yellow-500" : waiting ? "text-amber-600" : config.className}`} />;
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
      } ${!notification.isRead && notification.type === "approval" ? "border-s-4 border-primary bg-primary/10" : ""} hover-elevate`}
    >
      <NotificationIcon type={notification.type} link={notification.link} title={notification.title} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p dir="auto" className={`text-sm font-medium truncate ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
            {!notification.isRead && notification.type === "approval" && <span className="me-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">مطلوب</span>}
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
          )}
        </div>
        <p dir="auto" className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1">{timeAgo(notification.createdAt)}</p>
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
        {/* Opening the record counts as having read the notification */}
        <span className="block cursor-pointer" onClick={() => { if (!notification.isRead) onMarkAsRead(notification.id); }}>{content}</span>
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
      {[...notifications]
        .sort((a, b) => Number(!b.isRead && b.type === "approval") - Number(!a.isRead && a.type === "approval"))
        .slice(0, 10)
        .map((notification) => (
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const [muted, setMuted] = useState(() => (user?.id ? isSoundMuted(user.id) : false));
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

  // The unread count in the tab title, so it shows while this tab is in the background
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${base}` : base;
    return () => { document.title = document.title.replace(/^\(\d+\)\s*/, ""); };
  }, [unreadCount]);

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
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-primary" : ""}`} />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1.5 -end-1.5 h-5 min-w-5 px-1 flex items-center justify-center text-xs animate-pulse"
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
                  <Badge variant="secondary" className="h-4 w-4 p-0 text-[10px] ms-1 flex items-center justify-center">
                    {unreadGeneralCount > 9 ? "9+" : unreadGeneralCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="text-xs px-3 relative" data-testid="tab-messages">
                Messages
                {unreadMessagesCount > 0 && (
                  <Badge variant="secondary" className="h-4 w-4 p-0 text-[10px] ms-1 flex items-center justify-center">
                    {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={muted ? t("notifications:sound.unmute") : t("notifications:sound.mute")}
              onClick={() => { const next = !muted; setMuted(next); if (user?.id) setSoundMuted(user.id, next); }}
              data-testid="button-toggle-notification-sound"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllAsRead()}
                disabled={isMarkingAllAsRead}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 me-1" />
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
                <Trash2 className="h-3 w-3 me-1" />
                Clear all
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
