import { TeamMemberCard } from '../team-member-card';

export default function TeamMemberCardExample() {
  return (
    <TeamMemberCard
      id="1"
      name="Mike Johnson"
      email="mike.j@company.com"
      position="Project Manager"
      activeTasksCount={8}
      onViewDetails={() => console.log('View details')}
      onEdit={() => console.log('Edit team member')}
    />
  );
}
