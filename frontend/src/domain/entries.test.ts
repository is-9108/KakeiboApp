import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type EntryFormValues,
  categoriesFor,
  isValidDateString,
  validateEntry,
} from './entries'

describe('カテゴリのプリセット (T12)', () => {
  it('支出カテゴリは要件どおりの10種', () => {
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

  it('収入カテゴリは要件どおりの3種', () => {
    expect(INCOME_CATEGORIES).toEqual(['給与', '副収入', 'その他'])
  })

  it('種別に対応するカテゴリを返す', () => {
    expect(categoriesFor('収入')).toEqual(INCOME_CATEGORIES)
    expect(categoriesFor('支出')).toEqual(EXPENSE_CATEGORIES)
  })
})

/** 他項目を有効にした入力を返す。指定項目だけ上書きする */
function validValues(overrides: Partial<EntryFormValues> = {}): EntryFormValues {
  return { date: '2026-10-20', type: '支出', amount: '300', category: '食費', ...overrides }
}

describe('validateEntry (T8)', () => {
  it('全項目が有効ならエラーなし', () => {
    expect(validateEntry(validValues())).toEqual({})
  })

  it.each([
    ['date', '日付は必須です。'],
    ['type', '種別を選択してください。'],
    ['amount', '金額を入力してください。'],
    ['category', 'カテゴリを選択してください。'],
  ])('未入力の %s に日本語エラーを出す', (field, message) => {
    const values = validValues({ [field]: '' })
    const errors = validateEntry(values)
    expect(errors[field as keyof typeof errors]).toEqual([message])
  })
})

describe('validateEntry の金額検証 (T9・T10)', () => {
  it.each([
    ['-1', '金額は1以上の整数（円）で入力してください。'],
    ['1.5', '金額は1以上の整数（円）で入力してください。'],
    ['abc', '金額は1以上の整数（円）で入力してください。'],
  ])('金額 %s は正の整数として不正', (amount, message) => {
    expect(validateEntry(validValues({ amount }))).toEqual({ amount: [message] })
  })

  it('金額0は1円以上を求める', () => {
    expect(validateEntry(validValues({ amount: '0' }))).toEqual({
      amount: ['金額は1円以上で入力してください。'],
    })
  })

  it.each(['1', '2147483647'])('金額 %s は検証を通過する', (amount) => {
    expect(validateEntry(validValues({ amount }))).toEqual({})
  })

  it('金額2147483648は上限超過のエラー', () => {
    expect(validateEntry(validValues({ amount: '2147483648' }))).toEqual({
      amount: ['2,147,483,647円を超える金額は登録できません。'],
    })
  })
})

describe('validateEntry の日付検証 (T11)', () => {
  it('うるう年の2/29は有効', () => {
    expect(validateEntry(validValues({ date: '2028-02-29' }))).toEqual({})
  })

  it.each(['2026-02-29', '2026-04-31', '2026-10-32'])('無効な日付 %s はエラー', (date) => {
    expect(validateEntry(validValues({ date }))).toEqual({
      date: ['正しい日付を入力してください。'],
    })
  })

  it.each(['2026/10/20', '20261020', '10-20'])('形式違い %s はエラー', (date) => {
    expect(validateEntry(validValues({ date }))).toEqual({
      date: ['正しい日付を入力してください。'],
    })
  })
})

describe('validateEntry の種別とカテゴリ (T12)', () => {
  it('支出なのに収入カテゴリはエラー', () => {
    expect(validateEntry(validValues({ type: '支出', category: '給与' }))).toEqual({
      category: ['カテゴリは種別に対応するプリセットから選択してください。'],
    })
  })

  it('収入なのに支出カテゴリはエラー', () => {
    expect(validateEntry(validValues({ type: '収入', category: '食費' }))).toEqual({
      category: ['カテゴリは種別に対応するプリセットから選択してください。'],
    })
  })

  it('種別が空のときはカテゴリエラーを出さない', () => {
    expect(validateEntry(validValues({ type: '', category: '' }))).toEqual({
      type: ['種別を選択してください。'],
    })
  })
})

describe('isValidDateString (T11)', () => {
  it.each(['2026-10-20', '2028-02-29', '2000-02-29'])('有効な日付 %s はtrue', (date) => {
    expect(isValidDateString(date)).toBe(true)
  })

  it.each(['2026-02-29', '2026-04-31', '2026/10/20', '20261020', '', '2026-10'])('無効な日付 %s はfalse', (date) => {
    expect(isValidDateString(date)).toBe(false)
  })
})
