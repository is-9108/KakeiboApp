import { formatCurrency } from "@/lib/utils/formatCurrency";

interface AmountDisplayProps {
  amount: number;
  isIncome?: boolean;
  className?: string;
}

export default function AmountDisplay({
  amount,
  isIncome,
  className = "",
}: AmountDisplayProps) {
  const colorClass =
    isIncome === undefined
      ? "text-gray-900"
      : isIncome
      ? "text-green-600"
      : "text-red-600";

  return (
    <span className={`font-medium ${colorClass} ${className}`}>
      {formatCurrency(amount)}
    </span>
  );
}
