import type { ApiSummary } from '../api/client'
import { formatYen } from '../domain/format'
import './MonthlySummary.css'

/** 構成比を小数第1位のパーセント表記にする。非数値は0.0%として表示する。 */
function formatPercentage(percentage: number): string {
  if (!Number.isFinite(percentage)) {
    return '0.0%'
  }
  return `${percentage.toFixed(1)}%`
}

/**
 * 月次集計の表示。収入合計・支出合計・収支差額と、カテゴリ別支出内訳（金額と構成比）。
 * 数値は集計APIの値をそのまま表示し、クライアントで再集計・再丸めはしない。
 */
export default function MonthlySummary({ summary }: { summary: ApiSummary }) {
  return (
    <section aria-label="月次集計" className="monthly-summary">
      <h2>月次集計</h2>
      <dl className="monthly-summary__totals">
        <div className="monthly-summary__total">
          <dt>収入合計</dt>
          <dd>{formatYen(summary.incomeTotal)}</dd>
        </div>
        <div className="monthly-summary__total">
          <dt>支出合計</dt>
          <dd>{formatYen(summary.expenseTotal)}</dd>
        </div>
        <div className="monthly-summary__total">
          <dt>収支差額</dt>
          <dd>{formatYen(summary.balance)}</dd>
        </div>
      </dl>
      <h3>支出の内訳</h3>
      {summary.expenseBreakdown.length === 0 ? (
        <p>支出の内訳はありません。</p>
      ) : (
        <ul className="monthly-summary__breakdown">
          {summary.expenseBreakdown.map((breakdown) => (
            <li key={breakdown.category}>
              <span className="monthly-summary__category">{breakdown.category}</span>
              <span className="monthly-summary__amount">{formatYen(breakdown.amount)}</span>
              <span className="monthly-summary__percentage">{formatPercentage(breakdown.percentage)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
