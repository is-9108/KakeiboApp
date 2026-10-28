import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ENTRY_TYPES,
  categoriesForType,
  toEntryInput,
  validateEntryForm,
  type EntryField,
  type EntryFieldErrors,
  type EntryFormValues,
  type EntryInput,
} from '../domain/entries'

export interface EntryFormProps {
  mode: 'create' | 'edit'
  /** 編集開始のたびに増える値。同じ対象の再選択でもスクロール・フォーカスをやり直す。 */
  editKey?: number
  values: EntryFormValues
  submitting: boolean
  error: string | null
  onChange: (values: EntryFormValues) => void
  onSubmit: (input: EntryInput) => void
  onCancel: () => void
  /** 通信断で結果不明のときに、GETのみで一覧を再読み込みする。 */
  onReload?: () => void
}

const FIELD_ORDER: EntryField[] = ['date', 'type', 'amount', 'category']

/** 登録・編集で共用する収支フォーム。送信前に一括検証する。 */
export default function EntryForm({
  mode,
  editKey,
  values,
  submitting,
  error,
  onChange,
  onSubmit,
  onCancel,
  onReload,
}: EntryFormProps) {
  const [errors, setErrors] = useState<EntryFieldErrors>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const typeRef = useRef<HTMLSelectElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)

  // 編集開始時はフォームへスクロールし、見出しへフォーカスする。
  // 入力値ではなく編集開始の識別子（editKey）に依存させ、入力のたびに再実行しない。
  useEffect(() => {
    setErrors({})
    if (mode !== 'edit') return
    const heading = headingRef.current
    if (!heading) return
    heading.focus()
    heading.scrollIntoView?.({ block: 'start' })
  }, [mode, editKey])

  const clearError = (field: EntryField) => {
    setErrors((previous) => {
      if (previous[field] === undefined) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  const updateField = (patch: Partial<EntryFormValues>) => {
    onChange({ ...values, ...patch })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const nextErrors = validateEntryForm(values)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      const refs = {
        date: dateRef,
        type: typeRef,
        amount: amountRef,
        category: categoryRef,
      }
      for (const field of FIELD_ORDER) {
        if (nextErrors[field] !== undefined) {
          refs[field].current?.focus()
          break
        }
      }
      return
    }

    setErrors({})
    onSubmit(toEntryInput(values))
  }

  const typeOptions = ENTRY_TYPES
  const categoryOptions = categoriesForType(values.type)
  const heading = mode === 'edit' ? '収支の編集' : '収支の登録'

  return (
    <section className="entry-form" aria-labelledby="entry-form-heading">
      <h2 id="entry-form-heading" className="entry-form__heading" ref={headingRef} tabIndex={-1}>
        {heading}
      </h2>
      <form className="entry-form__form" aria-label="収支フォーム" noValidate onSubmit={handleSubmit}>
        <p className="entry-form__hint">保存先は入力した日付の月です。</p>

        <div className="entry-form__field">
          <label htmlFor="entry-date">日付</label>
          <input
            id="entry-date"
            ref={dateRef}
            type="date"
            value={values.date}
            aria-invalid={errors.date !== undefined ? true : undefined}
            aria-describedby={errors.date !== undefined ? 'entry-date-error' : undefined}
            onChange={(event) => {
              updateField({ date: event.target.value })
              clearError('date')
            }}
          />
          {errors.date !== undefined && (
            <p id="entry-date-error" className="entry-form__error" role="alert">
              {errors.date}
            </p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-type">種別</label>
          <select
            id="entry-type"
            ref={typeRef}
            value={values.type}
            aria-invalid={errors.type !== undefined ? true : undefined}
            aria-describedby={errors.type !== undefined ? 'entry-type-error' : undefined}
            onChange={(event) => {
              // 種別を変えたら、対応しないカテゴリを残さない。
              updateField({ type: event.target.value, category: '' })
              clearError('type')
              clearError('category')
            }}
          >
            <option value="">選択してください</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          {errors.type !== undefined && (
            <p id="entry-type-error" className="entry-form__error" role="alert">
              {errors.type}
            </p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-amount">金額</label>
          <input
            id="entry-amount"
            ref={amountRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={values.amount}
            aria-invalid={errors.amount !== undefined ? true : undefined}
            aria-describedby={errors.amount !== undefined ? 'entry-amount-error' : undefined}
            onChange={(event) => {
              updateField({ amount: event.target.value })
              clearError('amount')
            }}
          />
          {errors.amount !== undefined && (
            <p id="entry-amount-error" className="entry-form__error" role="alert">
              {errors.amount}
            </p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-category">カテゴリ</label>
          <select
            id="entry-category"
            ref={categoryRef}
            value={values.category}
            aria-invalid={errors.category !== undefined ? true : undefined}
            aria-describedby={errors.category !== undefined ? 'entry-category-error' : undefined}
            onChange={(event) => {
              updateField({ category: event.target.value })
              clearError('category')
            }}
          >
            <option value="">選択してください</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {errors.category !== undefined && (
            <p id="entry-category-error" className="entry-form__error" role="alert">
              {errors.category}
            </p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-memo">メモ</label>
          <textarea
            id="entry-memo"
            rows={2}
            value={values.memo}
            onChange={(event) => updateField({ memo: event.target.value })}
          />
        </div>

        {error !== null && (
          <div className="entry-form__alert" role="alert">
            <p>{error}</p>
            {onReload !== undefined && (
              <button type="button" onClick={onReload} disabled={submitting}>
                一覧を再読み込み
              </button>
            )}
          </div>
        )}

        <div className="entry-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting
              ? mode === 'edit'
                ? '保存中…'
                : '登録中…'
              : mode === 'edit'
                ? '保存する'
                : '登録する'}
          </button>
          {mode === 'edit' && (
            <button type="button" onClick={onCancel} disabled={submitting}>
              キャンセル
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
