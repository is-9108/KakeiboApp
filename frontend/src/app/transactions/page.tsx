export const dynamic = "force-dynamic";

import { getTransactions } from "@/lib/api/transactions";
import { getCategories } from "@/lib/api/categories";
import TransactionTable from "@/components/transactions/TransactionTable";

export default async function TransactionsPage() {
  const [transactions, categories] = await Promise.all([
    getTransactions(),
    getCategories(),
  ]);

  return <TransactionTable transactions={transactions} categories={categories} />;
}
