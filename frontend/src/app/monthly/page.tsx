"use client";

import { useState, useEffect, useCallback } from "react";
import { getMonthlies } from "@/lib/api/monthly";
import { Monthly } from "@/types";
import MonthlyReportList from "@/components/monthly/MonthlyReportList";
import MonthEndButton from "@/components/monthly/MonthEndButton";

export default function MonthlyPage() {
  const [monthlies, setMonthlies] = useState<Monthly[]>([]);

  const load = useCallback(() => {
    getMonthlies().then(setMonthlies);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">月次レポート</h1>
        <MonthEndButton onRefresh={load} />
      </div>

      <MonthlyReportList monthlies={monthlies} />
    </div>
  );
}
