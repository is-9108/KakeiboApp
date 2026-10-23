import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()))
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText))
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url())
  console.log('[route]', route.request().method(), url.pathname)
  await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
})
await page.goto('http://localhost:5174/')
try {
  await page.getByLabel('メールアドレス').fill('user@example.com', { timeout: 5000 })
  await page.getByLabel('パスワード').fill('Passw0rd!')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.waitForTimeout(3000)
} catch (e) {
  console.log('[error]', e.message)
}
const html = await page.evaluate(() => document.body.innerHTML)
console.log(html.slice(0, 1500))
await browser.close()
