import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { DEFAULT_CANVAS, DEFAULT_DEVICES, defaultRect } from './defaults'
import { fixtureDocument } from './fixture'
import {
  canvasFrame, canvasScaleFactor, computeRect, cornersOf, deviceScreen, fitRect, fromOffsets, offsets,
  resolveTree, setAnchorsKeepRect, setPivotKeepRect, worldMatrices, type ResolvedNode,
} from './layout'
import type { CanvasSettings } from './types'

describe('CanvasScaler', () => {
  it('Expand lấy cạnh nhỏ hơn', () => {
    expect(canvasScaleFactor(DEFAULT_CANVAS, 1080, 1920)).toBe(1)
    expect(canvasScaleFactor(DEFAULT_CANVAS, 1536, 2048)).toBeCloseTo(2048 / 1920)
    expect(canvasScaleFactor(DEFAULT_CANVAS, 1125, 2436)).toBeCloseTo(1125 / 1080)
  })
  it('Match theo log', () => {
    const c: CanvasSettings = { ...DEFAULT_CANVAS, screenMatchMode: 'MatchWidthOrHeight', match: 0.5 }
    const s = canvasScaleFactor(c, 2160, 1920)
    expect(s).toBeCloseTo(Math.sqrt(2))
  })
  it('iPad Expand: canvas rộng hơn 1080', () => {
    const f = canvasFrame(DEFAULT_CANVAS, deviceScreen(DEFAULT_DEVICES[2], DEFAULT_CANVAS))
    expect(f.size.y).toBeCloseTo(1920)
    expect(f.size.x).toBeCloseTo(1440)
  })
})

describe('RectTransform', () => {
  it('anchor giữa', () => {
    expect(computeRect({ x: 1080, y: 1920 }, defaultRect(200, 100))).toEqual({ x: 440, y: 910, width: 200, height: 100 })
  })
  it('kéo giãn có offset', () => {
    const rt = fromOffsets({ ...defaultRect(), anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 } }, { left: 10, right: 20, top: 30, bottom: 40 })
    expect(computeRect({ x: 100, y: 100 }, rt)).toEqual({ x: 10, y: 40, width: 70, height: 30 })
    expect(offsets(rt)).toEqual({ left: 10, right: 20, top: 30, bottom: 40 })
  })
  it('đổi anchor/pivot giữ nguyên rect', () => {
    const p = { x: 1080, y: 1920 }
    const rt = { ...defaultRect(300, 120), anchoredPosition: { x: 77, y: -33 } }
    const r0 = computeRect(p, rt)
    const a = setAnchorsKeepRect(rt, p, { x: 0, y: 0.2 }, { x: 0.7, y: 0.9 })
    expect(computeRect(p, a)).toEqual(r0)
    const b = setPivotKeepRect(a, p, { x: 0.1, y: 0.9 })
    const r2 = computeRect(p, b)
    expect(r2.x).toBeCloseTo(r0.x); expect(r2.y).toBeCloseTo(r0.y)
    expect(r2.width).toBeCloseTo(r0.width); expect(r2.height).toBeCloseTo(r0.height)
  })
  it('fitRect ngược của computeRect', () => {
    const rt = { ...defaultRect(), anchorMin: { x: 0.3, y: 0.1 }, anchorMax: { x: 0.6, y: 0.1 }, pivot: { x: 0.25, y: 0.75 } }
    const target = { x: 12, y: 34, width: 56, height: 78 }
    expect(computeRect({ x: 500, y: 400 }, fitRect(rt, { x: 500, y: 400 }, target))).toEqual(target)
  })
})

/** Kết quả mong đợi cho bộ kiểm chứng Unity: góc của mọi node trên canvas, mọi máy, mọi chế độ scaler. */
export function expectedCases() {
  const modes: CanvasSettings[] = [
    { ...DEFAULT_CANVAS },
    { ...DEFAULT_CANVAS, screenMatchMode: 'MatchWidthOrHeight', match: 0.5 },
    { ...DEFAULT_CANVAS, screenMatchMode: 'MatchWidthOrHeight', match: 0 },
    { ...DEFAULT_CANVAS, screenMatchMode: 'Shrink' },
  ]
  const doc = fixtureDocument()
  const cases = []
  for (const canvas of modes) {
    for (const device of DEFAULT_DEVICES) {
      const screen = deviceScreen(device, canvas)
      const frame = canvasFrame(canvas, screen)
      const tree = resolveTree(doc.root, frame)
      const mats = worldMatrices(tree)
      const nodes: Record<string, number[][]> = {}
      const visit = (r: ResolvedNode) => {
        nodes[r.node.id] = cornersOf(mats.get(r.node.id)!, r.local).map((p) => [p.x, p.y])
        r.children.forEach(visit)
      }
      visit(tree)
      cases.push({ device: device.id, canvas, screen: { w: screen.width, h: screen.height }, scale: frame.scale, canvasSize: frame.size, safe: frame.safe, nodes })
    }
  }
  return { document: doc, cases }
}

describe('fixture', () => {
  it('sinh tệp kiểm chứng Unity', () => {
    const data = expectedCases()
    expect(data.cases.length).toBe(32)
    if (process.env.GEN_FIXTURE) {
      mkdirSync('unity-verify/fixture', { recursive: true })
      writeFileSync('unity-verify/fixture/layout.json', JSON.stringify(data.document, null, 2))
      writeFileSync('unity-verify/fixture/expected.json', JSON.stringify(data.cases, null, 2))
    }
  })
})

describe('layout group khớp Unity', () => {
  it('110 node × 4 cỡ canvas so với đáp án do Unity tính', async () => {
    const { readFileSync } = await import('node:fs')
    const { applyUILayout } = await import('./uiLayout')
    const doc = JSON.parse(readFileSync('unity-verify/fixture/layout_groups.json', 'utf8'))
    const expected = JSON.parse(readFileSync('unity-verify/fixture/layout_groups_expected.json', 'utf8')) as {
      canvasSize: { x: number; y: number }
      nodes: Record<string, number[][]>
    }[]
    const sprites = Object.fromEntries(doc.sprites.map((s: { id: string }) => [s.id, s]))
    let worst = 0
    const bad: string[] = []
    for (const c of expected) {
      const frame = { scale: 1, size: c.canvasSize, safe: { x: 0, y: 0, width: c.canvasSize.x, height: c.canvasSize.y } }
      const { root } = applyUILayout(doc.root, frame, { sprites, measureText: () => ({ width: 0, height: 0 }) })
      const tree = resolveTree(root, frame)
      const mats = worldMatrices(tree)
      const visit = (r: ResolvedNode) => {
        const exp = c.nodes[r.node.id]
        if (exp) {
          const got = cornersOf(mats.get(r.node.id)!, r.local)
          got.forEach((p, i) => {
            const d = Math.max(Math.abs(p.x - exp[i][0]), Math.abs(p.y - exp[i][1]))
            worst = Math.max(worst, d)
            if (d > 0.01 && bad.length < 20) bad.push(`${c.canvasSize.x}x${c.canvasSize.y} ${r.node.name} góc ${i}: ${p.x.toFixed(3)},${p.y.toFixed(3)} ≠ ${exp[i]}`)
          })
        }
        r.children.forEach(visit)
      }
      visit(tree)
    }
    expect(bad, bad.join('\n')).toEqual([])
    expect(worst).toBeLessThan(0.01)
  })
})
