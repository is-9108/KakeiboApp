import { Category } from "@/types";

export function groupCategories(categories: Category[]): {
  income: Category[];
  expense: Category[];
} {
  return {
    income: categories.filter((c) => c.isIncome),
    expense: categories.filter((c) => !c.isIncome),
  };
}

export function getCategoryName(
  categories: Category[],
  categoryId: number
): string {
  return categories.find((c) => c.id === categoryId)?.name ?? "不明";
}

export function isIncome(categories: Category[], categoryId: number): boolean {
  return categories.find((c) => c.id === categoryId)?.isIncome ?? false;
}
