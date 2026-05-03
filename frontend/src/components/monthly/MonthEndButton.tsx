"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runMonthEnd } from "@/lib/api/monthly";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

export default function MonthEndButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setIsLoading(true);
    setError("");
    try {
      await runMonthEnd();
      setIsOpen(false);
      router.refresh();
    } catch {
      setError("月末処理に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        月末処理を実行
      </Button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="月末処理の確認">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            現在の取引を集計・削除し、サブスクを新規取引として登録します。実行しますか？
          </p>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              キャンセル
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={isLoading}
            >
              実行
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
