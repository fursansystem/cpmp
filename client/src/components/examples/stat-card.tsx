import { StatCard } from '../stat-card';
import { FolderKanban } from 'lucide-react';

export default function StatCardExample() {
  return (
    <StatCard
      title="Active Projects"
      value={12}
      icon={FolderKanban}
      trend={{ value: "+2 from last month", isPositive: true }}
    />
  );
}
