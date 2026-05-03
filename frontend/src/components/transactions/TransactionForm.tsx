"use client";

import { useState } from "react";
import { Category, Transaction } from "@/types";
import { groupCategories } from "@/lib/utils/categoryHelpers";
import Button from "@/components/ui/Button";

interface TransactionFormProps {
  categories: Category[];
  initial?: Transaction;
  onSubmit: (data: {
    categoryId: number;
    amount: number;
    memo: string;
    insertDate: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function TransactionForm({
  categories,
  initial,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const { income, expense } = groupCategories(categories);
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? (categories[0]?.id ?? 0)
  );
  const [amount, setAmount] = useState(initial?.amount.toString() ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [insertDate, setInsertDate] = useState(
    initial?.insertDate
      ? initial.insertDate.substring(0, 10)
      : new Date().toISOString().substring(0, 10)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("金額は正の整数を入力してください");
      return;
    }
    setIsLoading(true);
    try {
      await onSubmit({
        categoryId,
        amount: numAmount,
        memo,
        insertDate: new Date(insertDate).toISOString(),
      });
    } catch {
      setError("保存に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          カテゴリ
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(Number(e.target.value))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          {income.length > 0 && (
            <optgroup label="収入">
              {income.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {expense.length > 0 && (
            <optgroup label="支出">
              {expense.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          金額
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="1"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: 3000"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          メモ
        </label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: スーパーで購入"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          日付
        </label>
        <input
          type="date"
          value={insertDate}
          onChange={(e) => setInsertDate(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          キャンセル
        </Button>
        <Button variant="primary" type="submit" isLoading={isLoading}>
          {initial ? "更新" : "追加"}
        </Button>
      </div>
    </form>
  );
}
