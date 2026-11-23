// Chụp một gói .uilayout.zip trên từng máy (canvas 100%) và ảnh chế độ Mọi máy.
// Dùng: npm run build && DEVICES=16x9,iphonex,ipad node e2e/render.mjs <tệp zip> <thư mục ra>
import { chromium } from 'playwright-core'
import { preview } from 'vite'
const [zip, outDir] = process.argv.slice(2)
const server = await preview({ preview: { port: 0 }, logLevel: 'silent' })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 2200, height: 2800 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(server.resolvedUrls.local[0])
const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Mở…")')])
await ch.setFiles(zip)
await page.waitForTimeout(1500)
await page.locator('label.check:has-text("Khung") input').uncheck()
await page.locator('label.check:has-text("Safe area") input').uncheck()
await page.keyboard.press('Escape')
for (const id of (process.env.DEVICES ?? '16x9,iphonex,ipad,android20x9').split(',')) {
  await page.selectOption('.toolbar select', id)
  await page.click('button:has-text("100%")')
  await page.waitForTimeout(700)
  await page.locator('.stage').screenshot({ path: `${outDir}/web_${id}.png` })
}
await page.locator('label.check:has-text("Safe area") input').check()
await page.click('button:has-text("Mọi máy")')
await page.setViewportSize({ width: 1600, height: 1000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/web_grid.png` })
console.log('errors', errors)
await browser.close()
await server.close()
