"use client";

import { Subscription } from "@/types";
import AmountDisplay from "@/components/ui/AmountDisplay";
import Button from "@/components/ui/Button";

interface SubscriptionCardProps {
  subscription: Subscription;
  onEdit: (s: Subscription) => void;
  onDelete: (id: number) => void;
}

export default function SubscriptionCard({
  subscription,
  onEdit,
  onDelete,
}: SubscriptionCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900">{subscription.name}</p>
        <AmountDisplay amount={subscription.amount} className="text-sm" />
        <span className="text-xs text-gray-400 ml-1">/月</span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="py-1 text-xs"
          onClick={() => onEdit(subscription)}
        >
          編集
        </Button>
        <Button
          variant="danger"
          className="py-1 text-xs"
          onClick={() => onDelete(subscription.id)}
        >
          削除
        </Button>
      </div>
    </div>
  );
}
