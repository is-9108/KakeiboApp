import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  toSubscriptionInput, validateSubscriptionForm,
  type SubscriptionField, type SubscriptionFieldErrors, type SubscriptionFormValues, type SubscriptionInput,
} from '../domain/subscriptions'

export interface SubscriptionFormProps {
  mode: 'create' | 'edit'
  editKey?: number
  values: SubscriptionFormValues
  submitting: boolean
  error: string | null
  onChange: (values: SubscriptionFormValues) => void
  onSubmit: (input: SubscriptionInput) => void
  onCancel: () => void
  onReload?: () => void
}

const FIELDS: { key: SubscriptionField; label: string }[] = [
  { key: 'name', label: '名前' }, { key: 'amount', label: '金額' }, { key: 'memo', label: 'メモ' },
]

/** サブスク登録・編集フォーム。送信前にすべての項目を検証する。 */
export default function SubscriptionForm({ mode, editKey, values, submitting, error, onChange, onSubmit, onCancel, onReload }: SubscriptionFormProps) {
  const [errors, setErrors] = useState<SubscriptionFieldErrors>({})
  const [previousEdit, setPreviousEdit] = useState({ mode, editKey })
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  if (previousEdit.mode !== mode || previousEdit.editKey !== editKey) {
    setPreviousEdit({ mode, editKey })
    setErrors({})
  }
  useEffect(() => {
    if (mode !== 'edit') return
    headingRef.current?.focus()
    headingRef.current?.scrollIntoView?.({ block: 'start' })
  }, [mode, editKey])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const next = validateSubscriptionForm(values)
    setErrors(next)
    const first = FIELDS.find(({ key }) => next[key] !== undefined)
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#subscription-${first.key}`)?.focus()
      return
    }
    onSubmit(toSubscriptionInput(values))
  }

  return (
    <section className="subscription-form" aria-labelledby="subscription-form-heading">
      <h2 id="subscription-form-heading" ref={headingRef} tabIndex={-1}>{mode === 'edit' ? 'サブスクの編集' : 'サブスクの登録'}</h2>
      <form ref={formRef} aria-label="サブスクフォーム" noValidate onSubmit={handleSubmit}>
        {FIELDS.map(({ key, label }) => {
          const props = {
            id: `subscription-${key}`,
            value: values[key],
            disabled: submitting,
            'aria-invalid': errors[key] !== undefined ? true as const : undefined,
            'aria-describedby': errors[key] !== undefined ? `subscription-${key}-error` : undefined,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              onChange({ ...values, [key]: event.target.value })
              setErrors((previous) => ({ ...previous, [key]: undefined }))
            },
          }
          return (
            <div className="subscription-form__field" key={key}>
              <label htmlFor={props.id}>{label}</label>
              {key === 'memo' ? <textarea {...props} rows={3} /> : <input {...props} type="text" inputMode={key === 'amount' ? 'numeric' : undefined} />}
              {errors[key] !== undefined && <p id={`subscription-${key}-error`} role="alert">{errors[key]}</p>}
            </div>
          )
        })}
        {error !== null && <div className="subscription-form__alert" role="alert"><p>{error}</p>
          {onReload && <button type="button" onClick={onReload} disabled={submitting}>一覧を再読み込み</button>}
        </div>}
        <div className="subscription-form__actions">
          <button type="submit" disabled={submitting}>{submitting ? mode === 'edit' ? '保存中…' : '登録中…' : mode === 'edit' ? '保存する' : '登録する'}</button>
          {mode === 'edit' && <button type="button" onClick={onCancel} disabled={submitting}>キャンセル</button>}
        </div>
      </form>
    </section>
  )
}
