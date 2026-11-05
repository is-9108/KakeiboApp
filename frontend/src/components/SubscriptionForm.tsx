import { useEffect, useRef, useState, type FormEvent } from 'react'
import { validateSubscriptionForm, toSubscriptionInput, type SubscriptionErrors, type SubscriptionField, type SubscriptionFormValues, type SubscriptionInput } from '../domain/subscriptions'

interface Props {
  mode: 'create' | 'edit'
  editKey?: number
  values: SubscriptionFormValues
  submitting: boolean
  error: string | null
  fieldErrors: SubscriptionErrors
  onChange: (values: SubscriptionFormValues) => void
  onSubmit: (input: SubscriptionInput) => void
  onCancel: () => void
  onReload?: () => void
}
const fields: SubscriptionField[] = ['name', 'amount', 'memo']
const labels: Record<SubscriptionField, string> = { name: '名前', amount: '金額', memo: 'メモ' }

/** 登録と編集で共有する月額サブスクフォーム。 */
export default function SubscriptionForm({ mode, editKey, values, submitting, error, fieldErrors, onChange, onSubmit, onCancel, onReload }: Props) {
  const [errors, setErrors] = useState<SubscriptionErrors>({})
  const [previousEdit, setPreviousEdit] = useState({ mode, editKey })
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputs = useRef<Partial<Record<SubscriptionField, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  if (previousEdit.mode !== mode || previousEdit.editKey !== editKey) {
    setPreviousEdit({ mode, editKey }); setErrors({})
  }
  useEffect(() => {
    if (mode === 'edit') {
      headingRef.current?.focus()
      headingRef.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [mode, editKey])
  useEffect(() => {
    const first = fields.find(field => fieldErrors[field] !== undefined)
    if (first) inputs.current[first]?.focus()
  }, [fieldErrors])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    const next = validateSubscriptionForm(values)
    setErrors(next)
    const first = fields.find(field => next[field] !== undefined)
    if (first) { inputs.current[first]?.focus(); return }
    onSubmit(toSubscriptionInput(values))
  }
  return (
    <section className="subscription-form" aria-labelledby="subscription-form-heading">
      <h2 id="subscription-form-heading" ref={headingRef} tabIndex={-1}>{mode === 'edit' ? 'サブスクの編集' : 'サブスクの登録'}</h2>
      <form aria-label="サブスクフォーム" noValidate onSubmit={submit}>
        <p>毎月の金額を登録します。収支への自動登録は行いません。</p>
        {fields.map(field => {
          const message = errors[field] ?? fieldErrors[field]
          const attributes = {
            id: `subscription-${field}`, value: values[field], disabled: submitting,
            'aria-invalid': message !== undefined ? true as const : undefined,
            'aria-describedby': message !== undefined ? `subscription-${field}-error` : undefined,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              onChange({ ...values, [field]: event.target.value })
              setErrors(previous => ({ ...previous, [field]: undefined }))
            },
          }
          return (
            <div className="subscription-form__field" key={field}>
              <label htmlFor={attributes.id}>{labels[field]}</label>
              {field === 'memo'
                ? <textarea {...attributes} rows={3} ref={element => { inputs.current[field] = element }} />
                : <input {...attributes} type="text" inputMode={field === 'amount' ? 'numeric' : undefined} ref={element => { inputs.current[field] = element }} />}
              {message !== undefined && <p id={`subscription-${field}-error`} role="alert">{message}</p>}
            </div>
          )
        })}
        {error !== null && <div role="alert"><p>{error}</p>{onReload && <button type="button" disabled={submitting} onClick={onReload}>一覧を再読み込み</button>}</div>}
        <div className="subscriptions__actions">
          <button type="submit" disabled={submitting}>{submitting ? (mode === 'edit' ? '保存中…' : '登録中…') : (mode === 'edit' ? '保存する' : '登録する')}</button>
          {mode === 'edit' && <button type="button" disabled={submitting} onClick={onCancel}>キャンセル</button>}
        </div>
      </form>
    </section>
  )
}
