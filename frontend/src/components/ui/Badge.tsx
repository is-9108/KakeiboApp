interface BadgeProps {
  isIncome: boolean;
}

export default function Badge({ isIncome }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isIncome
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {isIncome ? "収入" : "支出"}
    </span>
  );
}
