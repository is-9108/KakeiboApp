import { Monthly } from "@/types";
import { formatCurrency } from "@/lib/utils/formatCurrency";

interface MonthlyReportCardProps {
  monthly: Monthly;
  index: number;
}

const expenseItems: { key: keyof Monthly; label: string }[] = [
  { key: "yatin", label: "家賃" },
  { key: "shokuhi", label: "食費" },
  { key: "kootsuuhi", label: "交通費" },
  { key: "gaishokuhi", label: "外食費" },
  { key: "nichiyouhin", label: "日用品" },
  { key: "shoseki", label: "書籍" },
  { key: "subscription", label: "サブスク" },
  { key: "koutsuuhi", label: "光熱費" },
  { key: "suidouhi", label: "水道費" },
  { key: "fuku", label: "服" },
  { key: "sonotaShishutsu", label: "その他支出" },
];

const incomeItems: { key: keyof Monthly; label: string }[] = [
  { key: "kyuuryo", label: "給料" },
  { key: "sonotaShuunyuu", label: "その他収入" },
];

export default function MonthlyReportCard({
  monthly,
  index,
}: MonthlyReportCardProps) {
  const shuusiColor =
    monthly.shuusi >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          レポート #{monthly.id}
        </h2>
        <span
          className={`text-lg font-bold ${shuusiColor}`}
        >
          収支: {formatCurrency(monthly.shuusi)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-green-700 mb-2 border-b pb-1">
            収入
          </h3>
          <dl className="space-y-1">
            {incomeItems.map(({ key, label }) => (
              <div key={key} className="flex justify-between text-sm">
                <dt className="text-gray-600">{label}</dt>
                <dd className="font-medium text-green-600">
                  {formatCurrency(monthly[key] as number)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2 border-b pb-1">
            支出
          </h3>
          <dl className="space-y-1">
            {expenseItems.map(({ key, label }) => (
              <div key={key} className="flex justify-between text-sm">
                <dt className="text-gray-600">{label}</dt>
                <dd className="font-medium text-red-600">
                  {formatCurrency(monthly[key] as number)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
