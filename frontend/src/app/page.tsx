"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getTransactions } from "@/lib/api/transactions";
import { getSubscriptions } from "@/lib/api/subscriptions";
import { getCategories } from "@/lib/api/categories";
import { isIncome } from "@/lib/utils/categoryHelpers";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { Transaction, Subscription, Category } from "@/types";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    Promise.all([getTransactions(), getSubscriptions(), getCategories()]).then(
      ([t, s, c]) => {
        setTransactions(t);
        setSubscriptions(s);
        setCategories(c);
      }
    );
  }, []);

  const now = new Date();
  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.insertDate);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  });

  const totalIncome = thisMonth
    .filter((t) => isIncome(categories, t.categoryId))
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = thisMonth
    .filter((t) => !isIncome(categories, t.categoryId))
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;
  const subscriptionTotal = subscriptions.reduce((sum, s) => sum + s.amount, 0);

  const quickLinks = [
    {
      href: "/transactions",
      label: "取引を管理",
      desc: `今月 ${thisMonth.length} 件`,
    },
    {
      href: "/subscriptions",
      label: "サブスク管理",
      desc: `${subscriptions.length} 件 / 月${formatCurrency(subscriptionTotal)}`,
    },
    {
      href: "/monthly",
      label: "月次レポート",
      desc: "月末処理を実行",
    },
    {
      href: "/categories",
      label: "カテゴリ一覧",
      desc: `${categories.length} カテゴリ`,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ダッシュボード</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500 mb-1">今月の収入</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totalIncome)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500 mb-1">今月の支出</p>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(totalExpense)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-500 mb-1">収支</p>
          <p
            className={`text-2xl font-bold ${
              balance >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quickLinks.map(({ href, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow block"
          >
            <p className="font-semibold text-gray-900 mb-1">{label}</p>
            <p className="text-sm text-gray-500">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
