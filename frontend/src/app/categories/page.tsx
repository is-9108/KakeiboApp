export const dynamic = "force-dynamic";

import { getCategories } from "@/lib/api/categories";
import { groupCategories } from "@/lib/utils/categoryHelpers";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

export default async function CategoriesPage() {
  const categories = await getCategories();
  const { income, expense } = groupCategories(categories);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">カテゴリ一覧</h1>

      {categories.length === 0 ? (
        <EmptyState message="カテゴリがありません" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-base font-semibold text-green-700 mb-3 border-b pb-2">
              収入カテゴリ
            </h2>
            <ul className="space-y-2">
              {income.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Badge isIncome={true} />
                  <span className="text-sm text-gray-800">{c.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-base font-semibold text-red-700 mb-3 border-b pb-2">
              支出カテゴリ
            </h2>
            <ul className="space-y-2">
              {expense.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Badge isIncome={false} />
                  <span className="text-sm text-gray-800">{c.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
