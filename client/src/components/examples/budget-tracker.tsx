import { BudgetTracker } from '../budget-tracker';

export default function BudgetTrackerExample() {
  return (
    <BudgetTracker
      projectName="Downtown Office Renovation"
      estimated={450000}
      actual={320000}
      contractValue={500000}
    />
  );
}
