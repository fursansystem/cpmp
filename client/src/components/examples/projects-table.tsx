import { ProjectsTable } from '../projects-table';

export default function ProjectsTableExample() {
  const mockProjects = [
    {
      id: "1",
      name: "Downtown Office Renovation",
      client: "Acme Corporation",
      status: "active" as const,
      contractValue: "$450,000",
      startDate: "2024-01-15",
      endDate: "2024-06-30",
      progress: 65,
    },
    {
      id: "2",
      name: "Residential Complex Build",
      client: "Smith Properties",
      status: "pending" as const,
      contractValue: "$2,100,000",
      startDate: "2024-03-01",
      endDate: "2024-12-31",
      progress: 15,
    },
  ];

  return (
    <ProjectsTable
      projects={mockProjects}
      onView={(id) => console.log('View project:', id)}
    />
  );
}
