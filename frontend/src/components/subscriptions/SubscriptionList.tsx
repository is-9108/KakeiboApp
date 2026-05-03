"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Subscription } from "@/types";
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from "@/lib/api/subscriptions";
import SubscriptionCard from "./SubscriptionCard";
import SubscriptionForm from "./SubscriptionForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

interface SubscriptionListProps {
  subscriptions: Subscription[];
}

export default function SubscriptionList({
  subscriptions,
}: SubscriptionListProps) {
  const router = useRouter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] =
    useState<Subscription | null>(null);

  const handleCreate = async (data: { name: string; amount: number }) => {
    await createSubscription({ Name: data.name, Amount: data.amount });
    setIsFormOpen(false);
    router.refresh();
  };

  const handleUpdate = async (data: { name: string; amount: number }) => {
    if (!editingSubscription) return;
    await updateSubscription({
      id: editingSubscription.id,
      name: data.name,
      amount: data.amount,
    });
    setEditingSubscription(null);
    router.refresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("このサブスクを削除しますか？")) return;
    await deleteSubscription(id);
    router.refresh();
  };

  const total = subscriptions.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">サブスク一覧</h1>
          {subscriptions.length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              月合計:{" "}
              <span className="font-medium text-red-600">
                ¥{total.toLocaleString("ja-JP")}
              </span>
            </p>
          )}
        </div>
        <Button onClick={() => setIsFormOpen(true)}>+ 追加</Button>
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState message="サブスクがありません" />
      ) : (
        <div className="space-y-3">
          {subscriptions.map((s) => (
            <SubscriptionCard
              key={s.id}
              subscription={s}
              onEdit={(s) => setEditingSubscription(s)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="サブスクを追加"
      >
        <SubscriptionForm
          onSubmit={handleCreate}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={!!editingSubscription}
        onClose={() => setEditingSubscription(null)}
        title="サブスクを編集"
      >
        {editingSubscription && (
          <SubscriptionForm
            initial={editingSubscription}
            onSubmit={handleUpdate}
            onCancel={() => setEditingSubscription(null)}
          />
        )}
      </Modal>
    </div>
  );
}
