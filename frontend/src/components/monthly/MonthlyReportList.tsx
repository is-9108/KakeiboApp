import { Monthly } from "@/types";
import MonthlyReportCard from "./MonthlyReportCard";
import EmptyState from "@/components/ui/EmptyState";

interface MonthlyReportListProps {
  monthlies: Monthly[];
}

export default function MonthlyReportList({ monthlies }: MonthlyReportListProps) {
  if (monthlies.length === 0) {
    return <EmptyState message="月次レポートがありません" />;
  }

  return (
    <div className="space-y-4">
      {[...monthlies].reverse().map((m, i) => (
        <MonthlyReportCard key={m.id} monthly={m} index={i} />
      ))}
    </div>
  );
}
