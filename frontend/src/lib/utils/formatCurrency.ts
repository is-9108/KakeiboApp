const formatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

export function formatCurrency(amount: number): string {
  return formatter.format(amount);
}
