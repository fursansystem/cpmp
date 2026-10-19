import { ProjectCard } from '../project-card';

export default function ProjectCardExample() {
  return (
    <ProjectCard
      id="1"
      name="Downtown Office Renovation"
      client="Acme Corporation"
      status="active"
      location="New York, NY"
      startDate="2024-01-15"
      endDate="2024-06-30"
      progress={65}
      onEdit={() => console.log('Edit clicked')}
    />
  );
}
