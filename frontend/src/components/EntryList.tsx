import type { ApiEntry } from '../api/client'
import './EntryList.css'

interface EntryListProps {
  entries: ApiEntry[]
  onEdit: (entry: ApiEntry) => void
  onDelete: (entry: ApiEntry) => void
  /** 更新処理中は編集・削除を受け付けない。 */
  disabled?: boolean
}

/** 桁区切り付きの円表記。 */
function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`
}

/**
 * 収支一覧。HTTP APIの並び順（日付の新しい順）をそのまま表示する。
 */
export default function EntryList({ entries, onEdit, onDelete, disabled = false }: EntryListProps) {
  if (entries.length === 0) {
    return (
      <section aria-label="収支一覧" className="entry-list">
        <h2>収支一覧</h2>
        <p>この月に登録されている収支はありません。</p>
      </section>
    )
  }

  return (
    <section aria-label="収支一覧" className="entry-list">
      <h2>収支一覧</h2>
      <ul className="entry-list__rows">
        {entries.map((entry) => (
          <li key={entry.id} aria-label={`収支 ${entry.date} ${entry.category}`} className="entry-list__row">
            <div className="entry-list__summary">
              <span className="entry-list__date">{entry.date}</span>
              <span className="entry-list__type">{entry.type}</span>
              <span className="entry-list__amount">{formatYen(entry.amount)}</span>
              <span className="entry-list__category">{entry.category}</span>
            </div>
            {entry.memo !== '' && <p className="entry-list__memo">{entry.memo}</p>}
            <div className="entry-list__actions">
              <button type="button" onClick={() => onEdit(entry)} disabled={disabled}>
                編集
              </button>
              <button type="button" onClick={() => onDelete(entry)} disabled={disabled}>
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
