import {
  ENTRY_TYPES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MAX_AMOUNT,
  categoriesForType,
  isValidEntryDate,
  toEntryInput,
  translateValidationErrors,
  validateEntryForm,
  type EntryFormValues,
} from './entries'

const validValues: EntryFormValues = {
  date: '2026-10-28',
  type: '支出',
  amount: '1500',
  category: '外食費',
  memo: '昼食',
}

describe('プリセット', () => {
  it('keeps the expense categories in the documented order（T10）', () => {
    expect(EXPENSE_CATEGORIES).toEqual([
      '外食費',
      '食費',
      '日用品',
      '交通費',
      '住居費',
      '光熱費',
      '通信費',
      '趣味・娯楽',
      '医療・健康',
      'その他',
    ])
  })

  it('keeps the income categories in the documented order（T10）', () => {
    expect(INCOME_CATEGORIES).toEqual(['給与', '副収入', 'その他'])
  })

  it('offers only the categories that match the type（T10）', () => {
    expect(ENTRY_TYPES).toEqual(['収入', '支出'])
    expect(categoriesForType('支出')).toEqual(EXPENSE_CATEGORIES)
    expect(categoriesForType('収入')).toEqual(INCOME_CATEGORIES)
    expect(categoriesForType('')).toEqual([])
    expect(categoriesForType('不明')).toEqual([])
  })
})

describe('isValidEntryDate', () => {
  it('accepts real dates between 0001 and 9999（T10）', () => {
    expect(isValidEntryDate('2026-10-28')).toBe(true)
    expect(isValidEntryDate('2024-02-29')).toBe(true)
    expect(isValidEntryDate('0001-01-01')).toBe(true)
    expect(isValidEntryDate('9999-12-31')).toBe(true)
  })

  it('rejects malformed or non-existent dates（T10）', () => {
    expect(isValidEntryDate('')).toBe(false)
    expect(isValidEntryDate('2026-02-30')).toBe(false)
    expect(isValidEntryDate('2025-02-29')).toBe(false)
    expect(isValidEntryDate('2026-13-01')).toBe(false)
    expect(isValidEntryDate('2026-00-10')).toBe(false)
    expect(isValidEntryDate('2026-1-1')).toBe(false)
    expect(isValidEntryDate('2026/10/28')).toBe(false)
    expect(isValidEntryDate('0000-01-01')).toBe(false)
    expect(isValidEntryDate('2026-10-28T00:00:00Z')).toBe(false)
  })
})

describe('validateEntryForm', () => {
  it('accepts a fully valid registration（T09、T10）', () => {
    expect(validateEntryForm(validValues)).toEqual({})
    expect(validateEntryForm({ ...validValues, amount: '1' })).toEqual({})
    expect(validateEntryForm({ ...validValues, amount: String(MAX_AMOUNT) })).toEqual({})
    expect(validateEntryForm({ ...validValues, amount: '0001' })).toEqual({})
    expect(validateEntryForm({ ...validValues, memo: '' })).toEqual({})
  })

  it('reports every empty required field in Japanese（T07）', () => {
    expect(
      validateEntryForm({ date: '', type: '', amount: '', category: '', memo: '' }),
    ).toEqual({
      date: '日付を入力してください。',
      type: '種別を選択してください。',
      amount: '金額を入力してください。',
      category: 'カテゴリを選択してください。',
    })
  })

  it('rejects an invalid date in Japanese（T10）', () => {
    expect(validateEntryForm({ ...validValues, date: '2026-02-30' })).toEqual({
      date: '日付を正しく入力してください。',
    })
  })

  it.each([
    ['0', '0'],
    ['-1', '-1'],
    ['1.5', '1.5'],
    ['1.0', '1.0'],
    ['1e3', '1e3'],
    ['1,000', '1,000'],
    ['abc', 'abc'],
    ['', ''],
    [' 1', ' 1'],
    ['１０００', '１０００'],
  ])('rejects the amount "%s" without rounding（T08）', (_label, amount) => {
    const errors = validateEntryForm({ ...validValues, amount })
    expect(errors.amount).toBe(
      amount === '' ? '金額を入力してください。' : '金額は1円以上の整数で入力してください。',
    )
  })

  it('rejects amounts above the API limit（T09）', () => {
    expect(validateEntryForm({ ...validValues, amount: '2147483648' })).toEqual({
      amount: '金額は2,147,483,647円以下で入力してください。',
    })
    expect(validateEntryForm({ ...validValues, amount: '99999999999999999999' })).toEqual({
      amount: '金額は2,147,483,647円以下で入力してください。',
    })
  })

  it('rejects an unsupported type or a category that does not match it（T10）', () => {
    expect(validateEntryForm({ ...validValues, type: '不明' })).toEqual({
      type: '種別を選択してください。',
      category: 'カテゴリを選択してください。',
    })
    expect(validateEntryForm({ ...validValues, category: '給与' })).toEqual({
      category: 'カテゴリを選択してください。',
    })
    expect(validateEntryForm({ ...validValues, type: '収入', category: '給与' })).toEqual({})
  })
})

describe('toEntryInput', () => {
  it('converts the amount string to a number and keeps the memo as-is（T11、T13）', () => {
    expect(toEntryInput(validValues)).toEqual({
      date: '2026-10-28',
      type: '支出',
      amount: 1500,
      category: '外食費',
      memo: '昼食',
    })
    expect(toEntryInput({ ...validValues, amount: '0001', memo: '' })).toEqual({
      date: '2026-10-28',
      type: '支出',
      amount: 1,
      category: '外食費',
      memo: '',
    })
  })
})

describe('translateValidationErrors', () => {
  it('maps known API field keys to its own Japanese messages（T17）', () => {
    expect(
      translateValidationErrors({
        date: ['Date is required.'],
        amount: ['Amount must be positive.'],
        memo: ['Memo is too long.'],
      }),
    ).toEqual([
      '日付を正しく入力してください。',
      '金額は1円以上2,147,483,647円以下で入力してください。',
      'メモの入力内容を確認してください。',
    ])
  })

  it('normalizes PascalCase keys to the same field messages（T17）', () => {
    expect(
      translateValidationErrors({
        Amount: ['Amount must be positive.'],
        Category: ['Category is invalid.'],
      }),
    ).toEqual([
      '金額は1円以上2,147,483,647円以下で入力してください。',
      'カテゴリを選択してください。',
    ])
  })

  it('normalizes surrounding whitespace and all-caps keys（T17）', () => {
    expect(translateValidationErrors({ ' amount ': ['bad'], DATE: ['bad'] })).toEqual([
      '金額は1円以上2,147,483,647円以下で入力してください。',
      '日付を正しく入力してください。',
    ])
  })

  it('falls back to a generic message when no valid field remains（T17）', () => {
    expect(translateValidationErrors({})).toEqual(['入力内容を確認してください。'])
    expect(translateValidationErrors({ unknown: ['English problem details'] })).toEqual([
      '入力内容を確認してください。',
    ])
  })

  it('does not expose unknown fields or English text（T17）', () => {
    expect(translateValidationErrors({ unknown: ['English problem details'] })).toEqual([
      '入力内容を確認してください。',
    ])
    expect(translateValidationErrors({})).toEqual(['入力内容を確認してください。'])
  })

  it('ignores unknown fields together with known ones（T17）', () => {
    expect(translateValidationErrors({ amount: ['金額は1以上の整数を指定してください。'], x: ['boom'] })).toEqual([
      '金額は1円以上2,147,483,647円以下で入力してください。',
    ])
  })
})
