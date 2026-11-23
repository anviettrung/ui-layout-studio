// Ô nhập dùng chung. Ô số: kéo nhãn sang trái/phải để đổi giá trị (như Unity), Enter/blur để chốt.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Color } from '../model/types'

interface NumProps {
  label?: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  title?: string
  disabled?: boolean
}

export function Num({ label, value, onChange, step = 1, min, max, title, disabled }: NumProps) {
  const [text, setText] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(fmt(value))
  }, [value, focused])
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const commit = (t: string) => {
    const v = evalNum(t)
    if (v !== null && Number.isFinite(v)) onChange(clamp(v))
    else setText(fmt(value))
  }
  const scrub = useRef<{ x: number; v: number } | null>(null)
  return (
    <label className={`num ${disabled ? 'disabled' : ''}`} title={title}>
      {label && (
        <span
          className="num-label"
          onPointerDown={(e) => {
            if (disabled) return
            scrub.current = { x: e.clientX, v: value }
            ;(e.target as Element).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!scrub.current) return
            const dx = e.clientX - scrub.current.x
            const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
            onChange(clamp(round(scrub.current.v + dx * step * mult)))
          }}
          onPointerUp={() => (scrub.current = null)}
        >
          {label}
        </span>
      )}
      <input
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true)
          e.target.select()
        }}
        onBlur={(e) => {
          setFocused(false)
          commit(e.target.value)
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(fmt(value))
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const v = clamp(round((evalNum(text) ?? value) + d))
            setText(fmt(v))
            onChange(v)
          }
        }}
      />
    </label>
  )
}

/** Cho phép gõ phép tính đơn giản, vd 1080/2 hoặc 120+24 */
function evalNum(t: string): number | null {
  const s = t.trim().replace(/,/g, '.')
  if (!/^[\d+\-*/().\s]+$/.test(s)) return null
  try {
    const v = Function(`"use strict";return (${s})`)() as number
    return typeof v === 'number' ? v : null
  } catch {
    return null
  }
}

function round(v: number) {
  return Math.round(v * 1000) / 1000
}

export function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="row-body">{children}</div>
    </div>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <header>
        <span>{title}</span>
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function hex2(v: number) {
  return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
}

export function ColorField({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  const hex = `#${hex2(value.r)}${hex2(value.g)}${hex2(value.b)}`
  return (
    <div className="color-field">
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const h = e.target.value
          onChange({ ...value, r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
        }}
      />
      <input
        className="hex"
        key={hex}
        defaultValue={hex.toUpperCase()}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => {
          const h = e.target.value.trim()
          if (/^#?[0-9a-f]{6}$/i.test(h)) {
            const s = h.replace('#', '')
            onChange({ ...value, r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255 })
          }
        }}
      />
      <Num label="A" value={Math.round(value.a * 255)} min={0} max={255} onChange={(a) => onChange({ ...value, a: a / 255 })} />
    </div>
  )
}
