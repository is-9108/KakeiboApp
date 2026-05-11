"use client";

import { useState, useEffect, useCallback } from "react";
import { getTransactions } from "@/lib/api/transactions";
import { getCategories } from "@/lib/api/categories";
import { Transaction, Category } from "@/types";
import TransactionTable from "@/components/transactions/TransactionTable";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(() => {
    Promise.all([getTransactions(), getCategories()]).then(([t, c]) => {
      setTransactions(t);
      setCategories(c);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TransactionTable
      transactions={transactions}
      categories={categories}
      onRefresh={load}
    />
  );
}
