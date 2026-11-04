import type { ApiSubscription } from '../api/client'
import { formatYen } from '../domain/month'

export interface SubscriptionListProps {
  subscriptions: ApiSubscription[]
  disabled?: boolean
  onEdit: (subscription: ApiSubscription) => void
  onDelete: (subscription: ApiSubscription) => void
}

/** 登録順（APIの順序）を保ったサブスク一覧。 */
export default function SubscriptionList({ subscriptions, disabled = false, onEdit, onDelete }: SubscriptionListProps) {
  return (
    <section className="subscription-list" aria-labelledby="subscription-list-heading">
      <h2 id="subscription-list-heading">サブスク一覧</h2>
      {subscriptions.length === 0 ? <p>登録されたサブスクはありません。</p> : (
        <ul className="subscription-list__items">
          {subscriptions.map((subscription) => (
            <li key={subscription.id} className="subscription-list__item">
              <p className="subscription-list__name">{subscription.name}</p>
              <p>{formatYen(subscription.amount)}</p>
              {subscription.memo !== '' && <p className="subscription-list__memo">{subscription.memo}</p>}
              <div className="subscription-list__actions">
                <button type="button" disabled={disabled} onClick={() => onEdit(subscription)} aria-label={`${subscription.name} のサブスクを編集`}>編集</button>
                <button type="button" disabled={disabled} onClick={() => onDelete(subscription)} aria-label={`${subscription.name} のサブスクを削除`}>削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
