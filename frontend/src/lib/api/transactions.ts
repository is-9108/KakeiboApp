import { Transaction } from "@/types";
import { apiFetch } from "./client";

export function getTransactions(): Promise<Transaction[]> {
  return apiFetch<Transaction[]>("/api/transaction");
}

export function getTransaction(id: number): Promise<Transaction> {
  return apiFetch<Transaction>(`/api/transaction/${id}`);
}

export function createTransaction(data: {
  Amount: number;
  Category: number;
  Memo: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>("/api/transaction", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTransaction(data: {
  id: number;
  categoryId: number;
  amount: number;
  memo: string;
  insertDate: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>(`/api/transaction/${data.id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteTransaction(id: number): Promise<void> {
  return apiFetch<void>(`/api/transaction/${id}`, { method: "DELETE" });
}
