import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { LogsIcon, FileUp, CheckCircle2, AlertCircle } from "lucide-react";
import type { Activity } from "@shared/schema";

export default function AuditLog() {
  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case "document_added":
        return <FileUp className="w-4 h-4" />;
      case "approval_request":
      case "status_changed":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case "document_added":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "approval_request":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "status_changed":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const getEventLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      document_added: "Document Uploaded",
      approval_request: "Approval Decision",
      status_changed: "Status Changed",
      task_created: "Activity Created",
      task_updated: "Activity Updated",
      progress_updated: "Progress Updated",
      comment: "Comment Added",
      general: "General Event",
      inspection_request: "Inspection Request",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Audit Log</h1>
          <p className="text-muted-foreground">
            Track all system events for compliance and review
          </p>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display mb-2">Audit Log</h1>
        <p className="text-muted-foreground">
          Track all system events for compliance and review
        </p>
      </div>

      {activities.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <LogsIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-2">No audit events yet</p>
            <p className="text-sm text-muted-foreground">
              System events will appear here as they occur
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <Card key={activity.id} className="overflow-hidden">
              <div className="p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1 text-muted-foreground">
                      {getEventIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="font-medium">{activity.title}</h3>
                        <Badge className={`${getEventBadgeColor(activity.type)} text-xs`}>
                          {getEventLabel(activity.type)}
                        </Badge>
                      </div>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>By: {activity.userName}</span>
                        <span>
                          {activity.createdAt
                            ? format(new Date(activity.createdAt), "MMM d, yyyy HH:mm")
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
