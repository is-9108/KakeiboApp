import type { ApiEntry } from '../api/client'
import { formatDateLabel, formatYen } from '../domain/month'

export interface EntryListProps {
  entries: ApiEntry[]
  disabled?: boolean
  onEdit: (entry: ApiEntry) => void
  onDelete: (entry: ApiEntry) => void
}

/** 日付の新しい順（APIの並び順を維持）に収支カードを並べる。 */
export default function EntryList({ entries, disabled = false, onEdit, onDelete }: EntryListProps) {
  return (
    <section className="entry-list" aria-labelledby="entry-list-heading">
      <h2 id="entry-list-heading">収支一覧</h2>
      {entries.length === 0 ? (
        <p className="entry-list__empty">この月の収支はありません。</p>
      ) : (
        <ul className="entry-list__items">
          {entries.map((entry) => {
            const summary = `${formatDateLabel(entry.date)} ${entry.category} ${formatYen(entry.amount)}`
            return (
              <li key={entry.id} className="entry-list__item">
                <div className="entry-list__main">
                  <p className="entry-list__date">{formatDateLabel(entry.date)}</p>
                  <p className="entry-list__amount">
                    <span className={`entry-list__type entry-list__type--${entry.type === '収入' ? 'income' : 'expense'}`}>
                      {entry.type}
                    </span>
                    <span>{formatYen(entry.amount)}</span>
                  </p>
                  <p className="entry-list__category">{entry.category}</p>
                  {entry.memo !== '' && <p className="entry-list__memo">{entry.memo}</p>}
                </div>
                <div className="entry-list__actions">
                  <button
                    type="button"
                    onClick={() => onEdit(entry)}
                    disabled={disabled}
                    aria-label={`${summary} の収支を編集`}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    disabled={disabled}
                    aria-label={`${summary} の収支を削除`}
                  >
                    削除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
