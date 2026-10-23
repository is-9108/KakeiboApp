/** 桁区切り付きの円表記。負数は -1,000円 のように符号つきで整形する。 */
export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`
}
