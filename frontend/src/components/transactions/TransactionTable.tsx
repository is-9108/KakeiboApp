"use client";

import { useState } from "react";
import { Transaction, Category } from "@/types";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/api/transactions";
import TransactionRow from "./TransactionRow";
import TransactionForm from "./TransactionForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onRefresh: () => void;
}

export default function TransactionTable({
  transactions,
  categories,
  onRefresh,
}: TransactionTableProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const handleCreate = async (data: {
    categoryId: number;
    amount: number;
    memo: string;
    insertDate: string;
  }) => {
    await createTransaction({
      Amount: data.amount,
      Category: data.categoryId,
      Memo: data.memo,
    });
    setIsFormOpen(false);
    onRefresh();
  };

  const handleUpdate = async (data: {
    categoryId: number;
    amount: number;
    memo: string;
    insertDate: string;
  }) => {
    if (!editingTransaction) return;
    await updateTransaction({
      id: editingTransaction.id,
      categoryId: data.categoryId,
      amount: data.amount,
      memo: data.memo,
      insertDate: data.insertDate,
    });
    setEditingTransaction(null);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("この取引を削除しますか？")) return;
    await deleteTransaction(id);
    onRefresh();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">取引一覧</h1>
        <Button onClick={() => setIsFormOpen(true)}>+ 追加</Button>
      </div>

      {transactions.length === 0 ? (
        <EmptyState message="取引がありません" />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">カテゴリ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">メモ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categories={categories}
                  onEdit={(t) => setEditingTransaction(t)}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="取引を追加"
      >
        <TransactionForm
          categories={categories}
          onSubmit={handleCreate}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={!!editingTransaction}
        onClose={() => setEditingTransaction(null)}
        title="取引を編集"
      >
        {editingTransaction && (
          <TransactionForm
            categories={categories}
            initial={editingTransaction}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTransaction(null)}
          />
        )}
      </Modal>
    </div>
  );
}
