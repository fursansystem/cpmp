import { TaskItem } from '../task-item';

export default function TaskItemExample() {
  return (
    <TaskItem
      id="1"
      title="Install electrical wiring in main floor"
      priority="high"
      status="in-progress"
      assignedTo="John Smith"
      dueDate="2024-03-15"
      onToggle={() => console.log('Task toggled')}
      onEdit={() => console.log('Edit task')}
      onDelete={() => console.log('Delete task')}
    />
  );
}
