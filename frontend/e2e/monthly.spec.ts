import { expect, type Page, test } from '@playwright/test'

/**
 * 月次画面のブラウザテスト（T26・T27）。
 * Cognitoはテスト用の認証差し替えで成功するようになっており、
 * APIはpage.routeで画面と同じ形のJSONを返す簡易サーバーとして振る舞う。
 */

interface Entry {
  id: number
  date: string
  type: string
  amount: number
  category: string
  memo: string
}

let nextId = 100

/** 月の形式をYYYY-MMに整える。 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Node側の現在時刻から、アプリと同じ規則（JST）で月を求める。 */
function jstMonth(): { month: string; label: string } {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const year = jst.getUTCFullYear()
  const month = jst.getUTCMonth() + 1
  return { month: `${year}-${pad(month)}`, label: `${year}年${month}月` }
}

/** 月次集計の計算（バックエンドと同じ丸め：小数第1位）。 */
function summaryFor(month: string, entries: Entry[]) {
  const incomeTotal = entries
    .filter((entry) => entry.type === '収入')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const expenseTotal = entries
    .filter((entry) => entry.type === '支出')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const expenseByCategory = new Map<string, number>()
  for (const entry of entries.filter((e) => e.type === '支出')) {
    expenseByCategory.set(entry.category, (expenseByCategory.get(entry.category) ?? 0) + entry.amount)
  }
  const expenseBreakdown = [...expenseByCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: Math.round((amount * 1000) / expenseTotal) / 10,
    }))
    .sort((a, b) => b.amount - a.amount)
  return { month, incomeTotal, expenseTotal, balance: incomeTotal - expenseTotal, expenseBreakdown }
}

/** 標準的なテストデータ。現在月（JST）に3件、翌月・前月は空。 */
function makeStore(): Record<string, Entry[]> {
  const month = jstMonth().month
  return {
    [month]: [
      { id: 1, date: `${month}-05`, type: '収入', amount: 250000, category: '給与', memo: '' },
      { id: 2, date: `${month}-12`, type: '支出', amount: 3000, category: '食費', memo: '' },
      { id: 3, date: `${month}-20`, type: '支出', amount: 1500, category: '外食費', memo: 'ラーメン' },
      {
        id: 4,
        date: `${month}-23`,
        type: '支出',
        amount: 500,
        category: '趣味・娯楽',
        memo: '多くの英字と日本語が混在し空白を含まない非常に長いメモAAAAAAAAAABBBBBBBBBBCCCCCCCCCCDDDDDDDDDD',
      },
    ],
  }
}

/** APIリクエストをpage.routeで受け、メモリ上の収支データで応答する。 */
async function installApi(page: Page, store: Record<string, Entry[]>) {
  /** ※モジュールURL（…/src/api/…）を拾わないよう、エンドポイント実体「/api/entries」に限定する */
  await page.route('**/api/entries**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const month = url.searchParams.get('month') ?? jstMonth().month
    const pathname = url.pathname

    if (request.method() === 'GET' && pathname === '/api/entries/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(summaryFor(month, store[month] ?? [])),
      })
      return
    }
    if (request.method() === 'GET' && pathname === '/api/entries') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(store[month] ?? []),
      })
      return
    }
    if (request.method() === 'POST' && (pathname === '/api/entries' || pathname === '/api/entries/')) {
      const input = (await request.postDataJSON()) as Omit<Entry, 'id'>
      nextId += 1
      const entryDate = input.date.slice(0, 7)
      const created: Entry = { id: nextId, ...input }
      store[entryDate] = [...(store[entryDate] ?? []), created]
      store[entryDate].sort((a, b) => (a.date < b.date ? 1 : -1))
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      })
      return
    }
    const idMatch = pathname.match(/^\/api\/entries\/(\d+)$/)
    if (idMatch !== null) {
      const id = Number(idMatch[1])
      if (request.method() === 'PUT') {
        const input = (await request.postDataJSON()) as Omit<Entry, 'id'>
        for (const [key, entries] of Object.entries(store)) {
          const index = entries.findIndex((e) => e.id === id)
          if (index >= 0) {
            const updated: Entry = { id, ...input }
            store[key] = entries.map((e) => (e.id === id ? updated : e))
            if (updated.date.slice(0, 7) !== key) {
              store[key] = store[key]!.filter((e) => e.id !== id)
              store[updated.date.slice(0, 7)] = [...(store[updated.date.slice(0, 7)] ?? []), updated]
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(updated),
            })
            return
          }
        }
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
        return
      }
      if (request.method() === 'DELETE') {
        for (const [key, entries] of Object.entries(store)) {
          store[key] = entries.filter((e) => e.id !== id)
        }
        await route.fulfill({ status: 204 })
        return
      }
    }
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })
}

/** ログインフォームから認証を通す（テスト用の認証は常に成功する）。 */
async function login(page: Page) {
  await page.getByLabel('メールアドレス').fill('user@example.com')
  await page.getByLabel('パスワード').fill('Passw0rd!')
  await page.getByRole('button', { name: 'ログイン' }).click()
}

/** 画面全体に横スクロールが発生していないこと。 */
async function expectNoHorizontalScroll(page: Page) {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth)
}

/** 収支一覧リージョン内のlistitemで絞り込む（内訳の内訳listitemと区別するため） */
function entryRow(page: Page, text: string) {
  return page
    .getByRole('region', { name: '収支一覧' })
    .getByRole('listitem')
    .filter({ hasText: text })
}

test.describe('375pxの画面 (T26)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('横スクロールせずに月切替・登録・編集・削除ができる (T26)', async ({ page }) => {
    const store = makeStore()
    await installApi(page, store)
    const { month, label } = jstMonth()

    await page.goto('/')
    await login(page)

    // 月次画面が表示され、長いメモを含む一覧でも横スクロールしない
    await expect(page.getByRole('heading', { name: '家計簿 月次画面' })).toBeVisible()
    await expect(page.getByText(label)).toBeVisible()
    await expect(entryRow(page, '外食費')).toContainText('1,500円')
    await expect(page.getByRole('region', { name: '月次集計' })).toContainText('5,000円')
    await expectNoHorizontalScroll(page)

    // 月切替：次月は空、一覧にその旨が表示される
    await page.getByRole('button', { name: '次月' }).click()
    await expect(page.getByText(/この月に登録されている収支はありません。/)).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.getByRole('button', { name: '前月' }).click()
    await expect(page.getByText(label)).toBeVisible()

    // 登録：必須エラー → 正常値で登録し一覧・集計へ反映
    await page.getByRole('button', { name: '登録' }).click()
    await expect(page.getByText('日付は必須です。')).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByLabel('日付').fill(`${month}-25`)
    await page.getByLabel('種別').selectOption('支出')
    await page.getByLabel('金額').fill('0')
    await page.getByLabel('カテゴリ').selectOption('食費')
    await page.getByRole('button', { name: '登録' }).click()
    await expect(page.getByText('金額は1円以上で入力してください。')).toBeVisible()

    await page.getByLabel('金額').fill('500')
    await page.getByRole('button', { name: '登録' }).click()
    const newRow = entryRow(page, `${month}-25`)
    await expect(newRow).toContainText('500円')
    await expect(page.getByRole('region', { name: '月次集計' })).toContainText('5,500円')
    await expectNoHorizontalScroll(page)

    // 編集：既存値が入った状態で開き、保存すると一覧に反映される
    await newRow.getByRole('button', { name: '編集' }).click()
    await expect(page.getByLabel('金額')).toHaveValue('500')
    await page.getByLabel('金額').fill('600')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(newRow).toContainText('600円')
    await expect(page.getByRole('region', { name: '月次集計' })).toContainText('5,600円')

    // 編集時の入力エラーとAPIのint上限値でも操作・表示に横はみ出しがない
    await newRow.getByRole('button', { name: '編集' }).click()
    await page.getByLabel('金額').fill('1.5')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('金額は1以上の整数（円）で入力してください。')).toBeVisible()
    await expect(page.getByLabel('金額')).toHaveValue('1.5')
    await expectNoHorizontalScroll(page)
    await page.getByLabel('金額').fill('2147483647')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(newRow).toContainText('2,147,483,647円')
    await expectNoHorizontalScroll(page)
    await newRow.getByRole('button', { name: '編集' }).click()
    await page.getByLabel('金額').fill('600')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(newRow).toContainText('600円')

    // 削除：確認ダイアログのキャンセルでは削除されない（Playwrightは既定でキャンセル扱い）
    await newRow.getByRole('button', { name: '削除' }).click()
    await expect(newRow).toBeVisible()

    // 削除：ダイアログを承認すると削除され、一覧・集計が更新される
    page.once('dialog', (dialog) => dialog.accept())
    await newRow.getByRole('button', { name: '削除' }).click()
    await expect(newRow).toHaveCount(0)
    await expect(page.getByRole('region', { name: '月次集計' })).toContainText('5,000円')

    // 日本語UIの最終確認
    await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})

test.describe('1280pxの画面 (T27)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('ワイド画面でも登録・編集・削除ができ、横スクロールしない (T27)', async ({ page }) => {
    const store = makeStore()
    await installApi(page, store)
    const { month, label } = jstMonth()

    await page.goto('/')
    await login(page)

    await expect(page.getByRole('heading', { name: '家計簿 月次画面' })).toBeVisible()
    await expect(page.getByText(label)).toBeVisible()
    await expectNoHorizontalScroll(page)

    // 登録
    await page.getByLabel('日付').fill(`${month}-28`)
    await page.getByLabel('種別').selectOption('収入')
    await page.getByLabel('金額').fill('10000')
    await page.getByLabel('カテゴリ').selectOption('副収入')
    await page.getByRole('button', { name: '登録' }).click()
    const newRow = entryRow(page, '副収入')
    await expect(newRow).toContainText('10,000円')
    await expect(page.getByRole('region', { name: '月次集計' })).toContainText('260,000円')

    // 編集
    await newRow.getByRole('button', { name: '編集' }).click()
    await expect(page.getByLabel('金額')).toHaveValue('10000')
    await page.getByLabel('金額').fill('12000')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(newRow).toContainText('12,000円')
    await expect(page.getByRole('region', { name: '月次集計' })).toContainText('262,000円')

    // 削除（キャンセル → 承認）
    await newRow.getByRole('button', { name: '削除' }).click()
    await expect(newRow).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await newRow.getByRole('button', { name: '削除' }).click()
    await expect(newRow).toHaveCount(0)

    // 月切替
    await page.getByRole('button', { name: '次月' }).click()
    await expect(page.getByRole('region', { name: '月次集計' })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })
})
