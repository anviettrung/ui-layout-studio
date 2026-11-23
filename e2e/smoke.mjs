// Chạy thử editor trên Chrome thật: nạp PNG, xếp một màn, đặt anchor, chụp ảnh, xuất zip, mở lại.
// Dùng: npm run build && node e2e/smoke.mjs <thư mục PNG mẫu> <thư mục kết quả>
import { chromium } from 'playwright-core'
import { preview } from 'vite'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'

const samples = resolve(process.argv[2] ?? '../_tmp/uls-samples')
const out = resolve(process.argv[3] ?? '../_tmp/uls-e2e')
mkdirSync(out, { recursive: true })
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const server = await preview({ preview: { port: 0 }, logLevel: 'silent' })
const url = server.resolvedUrls.local[0]
const errors = []
const browser = await chromium.launch({ executablePath: chrome, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(url)
  await page.waitForSelector('.toolbar')

  const tab = (name) => page.click(`.tabs button:has-text("${name}")`)
  const selectRow = async (name) => {
    await tab('Hierarchy')
    await page.locator('.tree-row', { hasText: name }).first().click()
  }
  const setNum = async (label, v) => {
    const inp = page.locator('.right .num', { has: page.locator(`.num-label:text-is("${label}")`) }).first().locator('input')
    await inp.fill(String(v))
    await inp.press('Enter')
  }
  const preset = async (index, { pivot = false, pos = false } = {}) => {
    await page.click('.anchor-btn')
    if (pivot) await page.locator('.anchor-opts label:has-text("Đặt cả pivot") input').check()
    if (pos) await page.locator('.anchor-opts label:has-text("Đặt cả vị trí") input').check()
    await page.locator('.anchor-grid button').nth(index).click()
    await page.mouse.click(5, 990)
  }

  // 1. Nạp PNG
  await tab('Assets')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("+ PNG")')])
  await chooser.setFiles(readdirSync(samples).filter((f) => f.endsWith('.png')).map((f) => join(samples, f)))
  await page.waitForFunction(() => document.querySelectorAll('.sprite-cell').length >= 6)

  const vp = page.locator('.center .viewport')
  const box = await vp.boundingBox()
  const drop = async (name, fx, fy) => {
    await tab('Assets')
    await page.locator('.sprite-cell', { hasText: name }).first().dragTo(vp, { targetPosition: { x: box.width * fx, y: box.height * fy } })
  }

  // 9-slice cho khung
  await page.locator('.sprite-cell', { hasText: 'panel_frame' }).click()
  for (const l of ['L', 'R', 'T', 'B']) await setNum(l, 48)

  // nền vào gốc, kéo giãn toàn màn
  await selectRow('NewScreen')
  await drop('bg_main', 0.5, 0.5)
  await preset(15, { pos: true })
  // nền phải vẽ dưới cùng: đưa lên đầu danh sách con
  await selectRow('bg_main')
  await page.click('.hier-actions button[title^="Lên"]')

  // thanh trên: kéo giãn ngang, neo trên
  await selectRow('SafeArea')
  await drop('panel_frame', 0.5, 0.15)
  await preset(3, { pivot: true, pos: true })
  await page.locator('.right select').filter({ hasText: 'Simple' }).selectOption('Sliced')
  await setNum('Height', 180)
  await setNum('Left', 24)
  await setNum('Right', 24)
  await setNum('Pos Y', -16)

  // nút neo giữa dưới
  await selectRow('SafeArea')
  await drop('btn_play', 0.5, 0.7)
  await preset(9)
  await selectRow('SafeArea')
  await drop('avatar', 0.3, 0.16)
  await selectRow('SafeArea')
  await drop('icon_coin', 0.62, 0.16)

  // Text
  await selectRow('SafeArea')
  await page.click('button:has-text("+ Text")')
  await page.locator('.right textarea').fill('Chào mừng trở lại!')
  await setNum('Pos Y', 300)
  await setNum('Width', 800)

  // kéo nút bằng chuột trong khung nhìn
  await selectRow('btn_play')
  const sel = await page.locator('.overlay .sel').boundingBox()
  await page.mouse.move(sel.x + sel.width / 2, sel.y + sel.height / 2)
  await page.mouse.down()
  await page.mouse.move(sel.x + sel.width / 2 + 40, sel.y + sel.height / 2 - 30, { steps: 8 })
  await page.mouse.up()

  await page.screenshot({ path: join(out, '1-single-16x9.png') })
  await page.selectOption('.toolbar select', 'iphonex')
  await page.screenshot({ path: join(out, '2-single-iphonex.png') })
  await page.click('button:has-text("Mọi máy")')
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, '3-grid.png') })
  await page.click('button:has-text("Một máy")')

  // Undo/redo
  await selectRow('icon_coin')
  const before = await page.locator('.tree-row').count()
  await page.keyboard.press('Delete')
  const afterDel = await page.locator('.tree-row').count()
  await page.keyboard.press('Control+z')
  const afterUndo = await page.locator('.tree-row').count()

  // 3. Xuất zip
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Xuất zip")')])
  const zipPath = join(out, dl.suggestedFilename())
  await dl.saveAs(zipPath)
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const doc = JSON.parse(await zip.file('layout.json').async('string'))
  const files = Object.keys(zip.files)

  // 4. Mở lại trên trang mới
  const page2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page2.goto(url)
  const [ch2] = await Promise.all([page2.waitForEvent('filechooser'), page2.click('button:has-text("Mở…")')])
  await ch2.setFiles(zipPath)
  await page2.waitForFunction(() => document.querySelectorAll('.tree-row').length > 5)
  const reopened = await page2.locator('.tree-row').count()
  await page2.screenshot({ path: join(out, '4-reopened.png') })

  const result = { before, afterDel, afterUndo, reopened, files, nodes: summarize(doc.root), sprites: doc.sprites.map((s) => [s.file, s.border]), errors }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 1))
  console.log(errors.length ? 'LỖI: ' + errors.join(' | ') : 'OK')
} finally {
  await browser.close()
  await server.close()
}

function summarize(n, depth = 0, acc = []) {
  const r = n.rect
  acc.push(
    `${'  '.repeat(depth)}${n.name} [${n.type}] aMin(${r.anchorMin.x},${r.anchorMin.y}) aMax(${r.anchorMax.x},${r.anchorMax.y}) piv(${r.pivot.x},${r.pivot.y}) pos(${r.anchoredPosition.x},${r.anchoredPosition.y}) size(${r.sizeDelta.x},${r.sizeDelta.y})`,
  )
  n.children.forEach((c) => summarize(c, depth + 1, acc))
  return acc
}
