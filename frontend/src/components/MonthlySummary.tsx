import type { ApiMonthlySummary } from '../api/client'
import { formatPercent, formatYen } from '../domain/month'

export interface MonthlySummaryProps {
  summary: ApiMonthlySummary
}

/** 収入合計・支出合計・収支差額とカテゴリ別の支出内訳。 */
export default function MonthlySummary({ summary }: MonthlySummaryProps) {
  const { incomeTotal, expenseTotal, balance, expenseBreakdown } = summary

  return (
    <section className="monthly-summary" aria-labelledby="monthly-summary-heading">
      <h2 id="monthly-summary-heading">月次集計</h2>
      <dl className="monthly-summary__totals">
        <div className="monthly-summary__total">
          <dt>収入合計</dt>
          <dd>{formatYen(incomeTotal)}</dd>
        </div>
        <div className="monthly-summary__total">
          <dt>支出合計</dt>
          <dd>{formatYen(expenseTotal)}</dd>
        </div>
        <div className="monthly-summary__total">
          <dt>収支差額</dt>
          <dd>{formatYen(balance)}</dd>
        </div>
      </dl>

      <h3 className="monthly-summary__breakdown-heading">カテゴリ別支出内訳</h3>
      {expenseBreakdown.length === 0 ? (
        <p className="monthly-summary__empty">支出の内訳はありません。</p>
      ) : (
        <ul className="monthly-summary__breakdown">
          {expenseBreakdown.map((item) => (
            <li key={item.category} className="monthly-summary__breakdown-item">
              <span className="monthly-summary__category">{item.category}</span>
              <span className="monthly-summary__amount">{formatYen(item.amount)}</span>
              <span className="monthly-summary__percentage">{formatPercent(item.percentage)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
