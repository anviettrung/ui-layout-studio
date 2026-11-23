// Đo chữ trên trình duyệt để thay cho TMP preferredWidth/Height khi chạy layout group.
// TMP: một dòng cao (ascender - descender) của font; các dòng sau cách nhau lineHeight + lineSpacing.
import type { TextData } from '../model/types'

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, { width: number; height: number }>()

function c2d(): CanvasRenderingContext2D {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')!
  return ctx
}

/** Xoá cache khi font nạp xong (số đo đổi). */
export function resetTextMeasureCache() {
  cache.clear()
}

export function measureText(t: TextData, width: number | null): { width: number; height: number } {
  // TMP: preferred size = chữ + margin; ngắt dòng trong bề rộng đã trừ margin
  const mg = t.margin ?? { left: 0, top: 0, right: 0, bottom: 0 }
  const inner = measureInner(t, width === null ? null : width - mg.left - mg.right)
  return { width: inner.width + mg.left + mg.right, height: inner.height + mg.top + mg.bottom }
}

function measureInner(t: TextData, width: number | null): { width: number; height: number } {
  const key = `${t.font}|${t.fontSize}|${t.bold}|${t.italic}|${t.characterSpacing}|${t.lineSpacing}|${width === null ? '-' : width.toFixed(2)}|${t.content}`
  const hit = cache.get(key)
  if (hit) return hit
  if (t.content === '') return { width: 0, height: 0 }
  const g = c2d()
  const size = t.fontSize
  g.font = `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${size}px "${t.font}", sans-serif`
  const spacing = (t.characterSpacing / 100) * size
  const measure = (s: string) => {
    if (!s) return 0
    return g.measureText(s).width + spacing * Math.max(0, [...s].length - 1)
  }
  const m = g.measureText('Hg')
  const ascDesc = (m.fontBoundingBoxAscent ?? size * 0.8) + (m.fontBoundingBoxDescent ?? size * 0.2)
  const lineStep = ascDesc + (t.lineSpacing / 100) * size

  const paragraphs = t.content.split('\n')
  let maxW = 0
  let lines = 0
  for (const p of paragraphs) {
    if (width === null || !t.wrap) {
      maxW = Math.max(maxW, measure(p))
      lines++
      continue
    }
    // ngắt dòng tham lam theo khoảng trắng, từ dài hơn khung thì ngắt theo ký tự
    const words = p.split(/(\s+)/)
    let line = ''
    for (const word of words) {
      const next = line + word
      if (line && measure(next.trimEnd()) > width + 0.01) {
        maxW = Math.max(maxW, measure(line.trimEnd()))
        lines++
        line = word.trimStart()
      } else line = next
    }
    maxW = Math.max(maxW, measure(line.trimEnd()))
    lines++
  }
  const r = { width: maxW, height: lines > 0 ? ascDesc + (lines - 1) * lineStep : 0 }
  cache.set(key, r)
  return r
}
