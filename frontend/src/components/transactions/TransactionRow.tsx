"use client";

import { Transaction, Category } from "@/types";
import { getCategoryName, isIncome } from "@/lib/utils/categoryHelpers";
import { formatDate } from "@/lib/utils/formatDate";
import AmountDisplay from "@/components/ui/AmountDisplay";
import Button from "@/components/ui/Button";

interface TransactionRowProps {
  transaction: Transaction;
  categories: Category[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: number) => void;
}

export default function TransactionRow({
  transaction,
  categories,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  const income = isIncome(categories, transaction.categoryId);
  const categoryName = getCategoryName(categories, transaction.categoryId);

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatDate(transaction.insertDate)}
      </td>
      <td className="px-4 py-3 text-sm">{categoryName}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{transaction.memo}</td>
      <td className="px-4 py-3 text-sm text-right">
        <AmountDisplay amount={transaction.amount} isIncome={income} />
      </td>
      <td className="px-4 py-3 text-sm text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            className="py-1 text-xs"
            onClick={() => onEdit(transaction)}
          >
            編集
          </Button>
          <Button
            variant="danger"
            className="py-1 text-xs"
            onClick={() => onDelete(transaction.id)}
          >
            削除
          </Button>
        </div>
      </td>
    </tr>
  );
}
