export const dynamic = "force-dynamic";

import { getMonthlies } from "@/lib/api/monthly";
import MonthlyReportList from "@/components/monthly/MonthlyReportList";
import MonthEndButton from "@/components/monthly/MonthEndButton";

export default async function MonthlyPage() {
  const monthlies = await getMonthlies();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">月次レポート</h1>
        <MonthEndButton />
      </div>

      <MonthlyReportList monthlies={monthlies} />
    </div>
  );
}
