import { useState, type FormEvent } from 'react'
import { ApiValidationError, type ApiEntry } from '../api/client'
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  type EntryFieldErrors,
  type EntryInput,
  toEntryInput,
  validateEntry,
} from '../domain/entries'
import './EntryForm.css'

/** 編集対象の既存値からフォームの初期値を作る。 */
export interface EntryFormInitialEntry {
  id: number
  date: string
  type: string
  amount: number
  category: string
  memo: string
}

export interface EntryFormProps {
  /** 送信ハンドラ。成功時はPromiseが解決し、失敗時はエラーをthrowする。 */
  onSubmit: (input: EntryInput) => Promise<void>
  /** 編集対象。指定すると編集モードになる。 */
  initialEntry?: EntryFormInitialEntry
  /** 編集をやめて新規フォームへ戻る（APIは呼ばない）。編集モードでのみ表示。 */
  onCancel?: () => void
}

const DATE_ERROR_ID = 'entry-date-error'
const TYPE_ERROR_ID = 'entry-type-error'
const AMOUNT_ERROR_ID = 'entry-amount-error'
const CATEGORY_ERROR_ID = 'entry-category-error'

/** 種別に対応するカテゴリの選択肢。 */
function categoryOptions(type: string): readonly string[] {
  if (type === '収入') {
    return INCOME_CATEGORIES
  }
  return EXPENSE_CATEGORIES
}

/**
 * 収支の登録・編集共通フォーム。
 * 新規ときは必須項目が未入力の状態で開き、編集ときは既存値が入った状態で開く。
 * 送信前にフォーム側で日本語の検証を行い、通った場合だけAPIを呼ぶ。
 */
export default function EntryForm({ onSubmit, initialEntry, onCancel }: EntryFormProps) {
  const editing = initialEntry !== undefined
  const [date, setDate] = useState(initialEntry?.date ?? '')
  const [type, setType] = useState(initialEntry?.type ?? '')
  const [amount, setAmount] = useState(initialEntry ? String(initialEntry.amount) : '')
  const [category, setCategory] = useState(initialEntry?.category ?? '')
  const [memo, setMemo] = useState(initialEntry?.memo ?? '')
  const [fieldErrors, setFieldErrors] = useState<EntryFieldErrors>({})
  const [overallError, setOverallError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const changeType = (nextType: string) => {
    setType(nextType)
    // 種別変更時は、共通カテゴリを含めて選択を解除する
    setCategory('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) {
      return
    }

    const values = { date, type, amount, category }
    const errors = validateEntry(values)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setOverallError(null)
      return
    }
    setFieldErrors({})
    setOverallError(null)
    setSubmitting(true)
    try {
      await onSubmit(toEntryInput(values, memo))
      // 成功時は新しい登録に備えて入力を空にする（編集モードからの復帰は親が行う）
      setDate('')
      setType('')
      setAmount('')
      setCategory('')
      setMemo('')
    } catch (error) {
      const validation = toFieldErrors(error)
      if (validation !== null) {
        setFieldErrors(normalizeFieldErrors(validation))
      }
      setOverallError(error instanceof Error && error.message ? error.message : '収支を保存できませんでした。')
    } finally {
      setSubmitting(false)
    }
  }

  const submitLabel = editing ? '保存' : '登録'
  const submittingLabel = editing ? '保存中…' : '登録中…'

  return (
    <section aria-label={editing ? '収支の編集' : '収支の登録'} className="entry-form">
      <h2>{editing ? '収支の編集' : '収支の登録'}</h2>
      <form onSubmit={(e) => { void handleSubmit(e) }} noValidate={true}>
        <div className="entry-form__field">
          <label htmlFor="entry-date">日付</label>
          <input
            id="entry-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-describedby={fieldErrors.date ? DATE_ERROR_ID : undefined}
            aria-invalid={fieldErrors.date !== undefined}
          />
          {fieldErrors.date !== undefined && (
            <p id={DATE_ERROR_ID} role="alert" className="entry-form__error">{fieldErrors.date[0]}</p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-type">種別</label>
          <select
            id="entry-type"
            value={type}
            onChange={(e) => changeType(e.target.value)}
            aria-describedby={fieldErrors.type ? TYPE_ERROR_ID : undefined}
            aria-invalid={fieldErrors.type !== undefined}
          >
            <option value="">未選択</option>
            <option value="収入">収入</option>
            <option value="支出">支出</option>
          </select>
          {fieldErrors.type !== undefined && (
            <p id={TYPE_ERROR_ID} role="alert" className="entry-form__error">{fieldErrors.type[0]}</p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-amount">金額</label>
          <input
            id="entry-amount"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby={fieldErrors.amount ? AMOUNT_ERROR_ID : undefined}
            aria-invalid={fieldErrors.amount !== undefined}
          />
          <span className="entry-form__unit">円</span>
          {fieldErrors.amount !== undefined && (
            <p id={AMOUNT_ERROR_ID} role="alert" className="entry-form__error">{fieldErrors.amount[0]}</p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-category">カテゴリ</label>
          <select
            id="entry-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-describedby={fieldErrors.category ? CATEGORY_ERROR_ID : undefined}
            aria-invalid={fieldErrors.category !== undefined}
          >
            <option value="">未選択</option>
            {categoryOptions(type).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {fieldErrors.category !== undefined && (
            <p id={CATEGORY_ERROR_ID} role="alert" className="entry-form__error">{fieldErrors.category[0]}</p>
          )}
        </div>

        <div className="entry-form__field">
          <label htmlFor="entry-memo">メモ</label>
          <textarea
            id="entry-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <span className="entry-form__hint">メモは任意です。</span>
        </div>

        {overallError !== null && <p role="alert" className="entry-form__error">{overallError}</p>}

        <div className="entry-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting ? submittingLabel : submitLabel}
          </button>
          {editing && (
            <button type="button" onClick={onCancel} disabled={submitting}>
              キャンセル
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

/** APIの項目別エラーを、フォームの表示用に正規化する。 */
function normalizeFieldErrors(errors: Readonly<Record<string, readonly string[]>>): EntryFieldErrors {
  const pick = (field: string): readonly string[] | undefined => {
    const messages = errors[field]
    if (messages === undefined || messages.length === 0) {
      return undefined
    }
    return messages
  }
  return {
    date: pick('date'),
    type: pick('type'),
    amount: pick('amount'),
    category: pick('category'),
  }
}

/**
 * 例外から項目別エラーを取り出す。ApiValidationErrorインスタンスに加えて、
 * テストでよく使われる name+fieldErrors を持つオブジェクトも受け付ける。
 */
function toFieldErrors(error: unknown): Readonly<Record<string, readonly string[]>> | null {
  if (error instanceof ApiValidationError) {
    return error.fieldErrors
  }
  if (
    typeof error === 'object' && error !== null
    && (error as { name?: unknown }).name === 'ApiValidationError'
    && typeof (error as { fieldErrors?: unknown }).fieldErrors === 'object'
    && (error as { fieldErrors?: unknown }).fieldErrors !== null
  ) {
    return (error as { fieldErrors: Record<string, readonly string[]> }).fieldErrors
  }
  return null
}


/** 編集対象の既存値をそのまま初期値にするためのヘルパー（テストや将来の用途向け）。 */
export function toInitialEntry(entry: ApiEntry): EntryFormInitialEntry {
  return {
    id: entry.id,
    date: entry.date,
    type: entry.type,
    amount: entry.amount,
    category: entry.category,
    memo: entry.memo,
  }
}
