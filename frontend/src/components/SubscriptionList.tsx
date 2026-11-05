import type { ApiSubscription } from '../api/client'
import { formatYen } from '../domain/month'
interface Props {
  subscriptions: ApiSubscription[]
  disabled: boolean
  onEdit: (subscription: ApiSubscription) => void
  onDelete: (subscription: ApiSubscription) => void
}
/** APIの登録順を保って一覧を表示する。 */
export default function SubscriptionList({ subscriptions, disabled, onEdit, onDelete }: Props) {
  return <section aria-labelledby="subscription-list-heading">
    <h2 id="subscription-list-heading">登録済みのサブスク</h2>
    {subscriptions.length === 0 ? <p>サブスクはまだ登録されていません。</p> : <ul className="subscription-list">
      {subscriptions.map(subscription => <li key={subscription.id}>
        <h3>{subscription.name}</h3>
        <p>{formatYen(subscription.amount)}／月</p>
        {subscription.memo !== '' && <p className="subscription-list__memo">{subscription.memo}</p>}
        <div className="subscriptions__actions">
          <button type="button" disabled={disabled} onClick={() => onEdit(subscription)}>編集</button>
          <button type="button" disabled={disabled} onClick={() => onDelete(subscription)}>削除</button>
        </div>
      </li>)}
    </ul>}
  </section>
}
