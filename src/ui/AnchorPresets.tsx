// Bảng preset anchor giống Unity: 4 cột (trái, giữa, phải, kéo giãn) × 4 hàng (trên, giữa, dưới, kéo giãn).
import { useEffect, useRef, useState } from 'react'
import type { RectTransformData, Vec2 } from '../model/types'
import { computeRect, fitRect, setAnchorsKeepRect } from '../model/layout'
import { Check } from './fields'

type Axis = number | 'stretch'
const COLS: Axis[] = [0, 0.5, 1, 'stretch']
const ROWS: Axis[] = [1, 0.5, 0, 'stretch']

export function applyPreset(rt: RectTransformData, parentSize: Vec2, ax: Axis, ay: Axis, setPivot: boolean, setPos: boolean): RectTransformData {
  const min = { x: ax === 'stretch' ? 0 : ax, y: ay === 'stretch' ? 0 : ay }
  const max = { x: ax === 'stretch' ? 1 : ax, y: ay === 'stretch' ? 1 : ay }
  let next = setAnchorsKeepRect(rt, parentSize, min, max)
  if (setPivot) {
    const pivot = { x: ax === 'stretch' ? 0.5 : ax, y: ay === 'stretch' ? 0.5 : ay }
    const r = computeRect(parentSize, next)
    next = fitRect({ ...next, pivot }, parentSize, r)
  }
  if (setPos) {
    next = {
      ...next,
      anchoredPosition: { x: 0, y: 0 },
      sizeDelta: { x: ax === 'stretch' ? 0 : next.sizeDelta.x, y: ay === 'stretch' ? 0 : next.sizeDelta.y },
    }
  }
  return next
}

function currentAxis(min: number, max: number): Axis | null {
  if (min === 0 && max === 1) return 'stretch'
  if (min === max && (min === 0 || min === 0.5 || min === 1)) return min
  return null
}

export function AnchorIcon({ ax, ay, size = 30 }: { ax: Axis | null; ay: Axis | null; size?: number }) {
  const s = size, pad = 5, inner = s - pad * 2
  const pos = (a: Axis | null, flip: boolean) => (a === null || a === 'stretch' ? null : pad + inner * (flip ? 1 - a : a))
  const x = pos(ax, false), y = pos(ay, true)
  return (
    <svg width={s} height={s} className="anchor-icon">
      <rect x={pad} y={pad} width={inner} height={inner} className="frame" />
      {ax === 'stretch' && <line x1={pad - 3} x2={s - pad + 3} y1={s / 2} y2={s / 2} className="arrow" />}
      {ay === 'stretch' && <line y1={pad - 3} y2={s - pad + 3} x1={s / 2} x2={s / 2} className="arrow" />}
      {x !== null && y !== null && <circle cx={x} cy={y} r={2.5} className="dot" />}
      {x !== null && ay === 'stretch' && <line x1={x} x2={x} y1={pad} y2={s - pad} className="arrow" />}
      {y !== null && ax === 'stretch' && <line y1={y} y2={y} x1={pad} x2={s - pad} className="arrow" />}
    </svg>
  )
}

export function AnchorPresets({ rt, parentSize, onChange }: { rt: RectTransformData; parentSize: Vec2; onChange: (r: RectTransformData) => void }) {
  const [open, setOpen] = useState(false)
  const [setPivot, setSetPivot] = useState(false)
  const [setPos, setSetPos] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])
  const cx = currentAxis(rt.anchorMin.x, rt.anchorMax.x)
  const cy = currentAxis(rt.anchorMin.y, rt.anchorMax.y)
  return (
    <div className="anchor-presets" ref={ref}>
      <button className="anchor-btn" onClick={() => setOpen(!open)} title="Anchor presets">
        <AnchorIcon ax={cx} ay={cy} size={40} />
      </button>
      {open && (
        <div className="anchor-pop">
          <div className="anchor-opts">
            <Check label="Đặt cả pivot (Shift)" checked={setPivot} onChange={setSetPivot} />
            <Check label="Đặt cả vị trí (Alt)" checked={setPos} onChange={setSetPos} />
          </div>
          <div className="anchor-grid">
            {ROWS.map((ay) =>
              COLS.map((ax) => (
                <button
                  key={`${ax}-${ay}`}
                  className={ax === cx && ay === cy ? 'on' : ''}
                  onClick={(e) => {
                    onChange(applyPreset(rt, parentSize, ax, ay, setPivot || e.shiftKey, setPos || e.altKey))
                  }}
                >
                  <AnchorIcon ax={ax} ay={ay} />
                </button>
              )),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
