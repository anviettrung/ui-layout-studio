// Viền / bóng chữ của TextMeshPro (thông số material). Preset lấy từ các chữ trong màn đang dùng preset đó.
import type { Color, LayoutNode, TextData } from '../model/types'
import { walk } from '../model/tree'
import { updateNode, useStore } from '../store'
import { Check, ColorField, Row, Section } from './fields'

type Fx = Pick<TextData, 'materialPreset' | 'faceDilate' | 'outline' | 'underlay'>

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 }

/** Các preset có trong tài liệu: tên → thông số (lấy từ chữ đầu tiên dùng preset đó). */
function usePresets(): Map<string, Fx> {
  const root = useStore((s) => s.doc.root)
  const out = new Map<string, Fx>()
  walk(root, (n) => {
    const t = n.text
    if (t?.materialPreset && !out.has(t.materialPreset)) {
      out.set(t.materialPreset, { materialPreset: t.materialPreset, faceDilate: t.faceDilate, outline: t.outline, underlay: t.underlay })
    }
  })
  return out
}

function Slider({ value, min, max, step = 0.01, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mono small">{value.toFixed(2)}</span>
    </>
  )
}

export function TextMaterialSection({ node }: { node: LayoutNode }) {
  const t = node.text!
  const presets = usePresets()
  // Sửa thông số tay thì bỏ tên preset: importer sẽ tìm/tạo preset dùng chung cho đúng bộ thông số này
  const set = (patch: Partial<Fx>, key: string, keepPreset = false) =>
    updateNode(node.id, (n) => ({ ...n, text: { ...n.text!, ...(keepPreset ? {} : { materialPreset: undefined }), ...patch } }), { mergeKey: `${node.id}:${key}` })
  const fd = t.faceDilate ?? 0
  const preset = t.materialPreset ?? ''
  return (
    <Section title="Viền & bóng (material TMP)">
      <Row label="Preset">
        <select
          value={presets.has(preset) || !preset ? preset : '__keep'}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') set({ faceDilate: 0, outline: undefined, underlay: undefined }, 'preset')
            else if (v !== '__keep') set({ ...presets.get(v)! }, 'preset', true)
          }}
        >
          <option value="">(mặc định của font)</option>
          {[...presets.keys()].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          {preset && !presets.has(preset) && <option value="__keep">{preset}</option>}
        </select>
      </Row>
      {!preset && (t.outline || t.underlay || fd !== 0) && <div className="note small">Thông số tự đặt: Unity sẽ tìm hoặc tạo một preset dùng chung cho đúng bộ thông số này.</div>}
      <Row label="Face Dilate">
        <Slider value={fd} min={-1} max={1} onChange={(v) => set({ faceDilate: v }, 'fd')} />
      </Row>
      <Check label="Outline" checked={!!t.outline} onChange={(v) => set({ outline: v ? { width: 0.2, color: BLACK } : undefined }, 'ol')} />
      {t.outline && (
        <>
          <Row label="Thickness">
            <Slider value={t.outline.width} min={0} max={1} onChange={(v) => set({ outline: { ...t.outline!, width: v } }, 'olw')} />
          </Row>
          <Row label="Color">
            <ColorField value={t.outline.color} onChange={(c) => set({ outline: { ...t.outline!, color: c } }, 'olc')} />
          </Row>
        </>
      )}
      <Check
        label="Underlay (bóng)"
        checked={!!t.underlay}
        onChange={(v) => set({ underlay: v ? { color: { r: 0, g: 0, b: 0, a: 0.5 }, offsetX: 0, offsetY: -0.5, dilate: 0, softness: 0 } : undefined }, 'ul')}
      />
      {t.underlay && (
        <>
          <Row label="Color">
            <ColorField value={t.underlay.color} onChange={(c) => set({ underlay: { ...t.underlay!, color: c } }, 'ulc')} />
          </Row>
          <Row label="Offset X">
            <Slider value={t.underlay.offsetX} min={-1} max={1} onChange={(v) => set({ underlay: { ...t.underlay!, offsetX: v } }, 'ulx')} />
          </Row>
          <Row label="Offset Y">
            <Slider value={t.underlay.offsetY} min={-1} max={1} onChange={(v) => set({ underlay: { ...t.underlay!, offsetY: v } }, 'uly')} />
          </Row>
          <Row label="Dilate">
            <Slider value={t.underlay.dilate} min={-1} max={1} onChange={(v) => set({ underlay: { ...t.underlay!, dilate: v } }, 'uld')} />
          </Row>
          <Row label="Softness">
            <Slider value={t.underlay.softness} min={0} max={1} onChange={(v) => set({ underlay: { ...t.underlay!, softness: v } }, 'uls')} />
          </Row>
        </>
      )}
    </Section>
  )
}
