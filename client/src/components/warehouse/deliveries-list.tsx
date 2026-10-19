import ProjectDeliveries from "@/pages/ProjectDeliveries";

// The deliveries list already lives in ProjectDeliveries; rendering it in embedded mode
// keeps one implementation for both the standalone /deliveries route and this tab, so the
// two can never drift apart.
export function DeliveriesList({ projectId }: { projectId: string }) {
  return <ProjectDeliveries embedded projectId={projectId} />;
}
