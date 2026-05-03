"use client";

import { useState } from "react";
import { Subscription } from "@/types";
import Button from "@/components/ui/Button";

interface SubscriptionFormProps {
  initial?: Subscription;
  onSubmit: (data: { name: string; amount: number }) => Promise<void>;
  onCancel: () => void;
}

export default function SubscriptionForm({
  initial,
  onSubmit,
  onCancel,
}: SubscriptionFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.amount.toString() ?? "");
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
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    setIsLoading(true);
    try {
      await onSubmit({ name: name.trim(), amount: numAmount });
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
          サービス名
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: Netflix"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          月額金額
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="1"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: 1490"
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
