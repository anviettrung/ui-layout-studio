import type { FillMethod, HAlign, ImageType, LayoutNode, RectTransformData, VAlign } from '../model/types'

const FILL_ORIGINS: Record<FillMethod, string[]> = {
  Horizontal: ['Left', 'Right'],
  Vertical: ['Bottom', 'Top'],
  Radial90: ['BottomLeft', 'TopLeft', 'TopRight', 'BottomRight'],
  Radial180: ['Bottom', 'Left', 'Top', 'Right'],
  Radial360: ['Bottom', 'Right', 'Top', 'Left'],
}
import { fromOffsets, offsets, setAnchorsKeepRect, setPivotKeepRect } from '../model/layout'
import { findNode } from '../model/tree'
import { updateDoc, updateNode, useStore } from '../store'
import { useActiveLayout } from '../useLayout'
import { AnchorPresets } from './AnchorPresets'
import { Check, ColorField, Num, Row, Section } from './fields'
import { SpriteInspector } from './Assets'
import { LayoutComponents } from './LayoutComponents'

export function Inspector() {
  const selection = useStore((s) => s.selection)
  const selectedSprite = useStore((s) => s.selectedSprite)
  const root = useStore((s) => s.doc.root)
  if (selectedSprite) return <SpriteInspector id={selectedSprite} />
  const node = selection ? findNode(root, selection) : null
  if (!node) return <div className="empty-hint">Chọn một node trong khung nhìn hoặc Hierarchy để chỉnh.</div>
  return <NodeInspector node={node} />
}

function NodeInspector({ node }: { node: LayoutNode }) {
  const isRoot = node.id === 'root'
  const mk = (k: string) => `${node.id}:${k}`
  return (
    <div className="inspector">
      <div className="insp-head">
        {!isRoot && (
          <input
            type="checkbox"
            title="Active (SetActive)"
            checked={node.active}
            onChange={(e) => updateNode(node.id, (n) => ({ ...n, active: e.target.checked }))}
          />
        )}
        <input
          className="name-input"
          value={node.name}
          onChange={(e) => {
            const name = e.target.value
            updateNode(node.id, (n) => ({ ...n, name }), { mergeKey: mk('name') })
            if (isRoot) updateDoc((d) => ({ ...d, name }), { history: 'none' })
          }}
        />
        <span className="type-badge">{node.type}</span>
      </div>
      {isRoot && <div className="note">Gốc = Canvas, luôn kéo giãn toàn màn. Tên gốc là tên prefab và tên tệp xuất.</div>}
      {node.type === 'SafeArea' && (
        <div className="note">
          Kéo giãn toàn màn và tự thu vào trong safe area của từng máy (tai thỏ, home indicator). Trong Unity được gắn
          component SafePadding.
        </div>
      )}
      {!isRoot && node.type !== 'SafeArea' && <RectInspector node={node} />}
      {node.type === 'Image' && node.image && <ImageInspector node={node} />}
      {node.type === 'Text' && node.text && <TextInspector node={node} />}
      {!isRoot && node.type !== 'SafeArea' && <LayoutComponents node={node} />}
    </div>
  )
}

function RectInspector({ node }: { node: LayoutNode }) {
  const layout = useActiveLayout()
  const parentId = layout.parentOf.get(node.id)
  const parent = parentId ? layout.byId.get(parentId) : undefined
  const parentSize = parent ? { x: parent.local.width, y: parent.local.height } : { x: 0, y: 0 }
  const drv = layout.driven.get(node.id)
  // Node bị layout điều khiển: hiện giá trị đã tính (như Unity), khoá phần bị điều khiển
  const rt = drv ? layout.byId.get(node.id)?.node.rect ?? node.rect : node.rect
  const lockPos = !!drv && (drv.position[0] || drv.position[1])
  const set = (r: RectTransformData, key: string) => updateNode(node.id, (n) => ({ ...n, rect: r }), { mergeKey: `${node.id}:${key}` })
  const stretchX = rt.anchorMin.x !== rt.anchorMax.x
  const stretchY = rt.anchorMin.y !== rt.anchorMax.y
  const o = offsets(rt)
  const setO = (k: keyof typeof o, v: number) => set(fromOffsets(rt, { ...o, [k]: v }), `o${k}`)
  const ap = rt.anchoredPosition
  const sd = rt.sizeDelta
  return (
    <Section title="Rect Transform">
      {drv && (
        <div className="note driven-note">
          Một số giá trị do <b>{drv.by}</b> điều khiển
          {drv.size[0] || drv.size[1] ? ` (${[drv.position[0] || drv.size[0] ? 'ngang' : '', drv.position[1] || drv.size[1] ? 'dọc' : ''].filter(Boolean).join(', ')})` : ''}. Sửa ở
          node cha hoặc LayoutElement.
        </div>
      )}
      <div className={lockPos ? 'driven-lock' : ''}>
      <div className="rt-top">
        <AnchorPresets rt={rt} parentSize={parentSize} onChange={(r) => set(r, 'preset')} />
        <div className="rt-grid">
          {stretchX ? (
            <Num label="Left" value={o.left} onChange={(v) => setO('left', v)} />
          ) : (
            <Num label="Pos X" value={ap.x} onChange={(v) => set({ ...rt, anchoredPosition: { ...ap, x: v } }, 'px')} />
          )}
          {stretchY ? (
            <Num label="Top" value={o.top} onChange={(v) => setO('top', v)} />
          ) : (
            <Num label="Pos Y" value={ap.y} onChange={(v) => set({ ...rt, anchoredPosition: { ...ap, y: v } }, 'py')} />
          )}
          {stretchX ? (
            <Num label="Right" value={o.right} onChange={(v) => setO('right', v)} />
          ) : (
            <Num label="Width" value={sd.x} onChange={(v) => set({ ...rt, sizeDelta: { ...sd, x: v } }, 'w')} />
          )}
          {stretchY ? (
            <Num label="Bottom" value={o.bottom} onChange={(v) => setO('bottom', v)} />
          ) : (
            <Num label="Height" value={sd.y} onChange={(v) => set({ ...rt, sizeDelta: { ...sd, y: v } }, 'h')} />
          )}
        </div>
      </div>
      <Row label="Anchor Min">
        <Num label="X" step={0.01} value={rt.anchorMin.x} onChange={(v) => set(setAnchorsKeepRect(rt, parentSize, { ...rt.anchorMin, x: v }, rt.anchorMax), 'amin')} />
        <Num label="Y" step={0.01} value={rt.anchorMin.y} onChange={(v) => set(setAnchorsKeepRect(rt, parentSize, { ...rt.anchorMin, y: v }, rt.anchorMax), 'amin')} />
      </Row>
      <Row label="Anchor Max">
        <Num label="X" step={0.01} value={rt.anchorMax.x} onChange={(v) => set(setAnchorsKeepRect(rt, parentSize, rt.anchorMin, { ...rt.anchorMax, x: v }), 'amax')} />
        <Num label="Y" step={0.01} value={rt.anchorMax.y} onChange={(v) => set(setAnchorsKeepRect(rt, parentSize, rt.anchorMin, { ...rt.anchorMax, y: v }), 'amax')} />
      </Row>
      <Row label="Pivot">
        <Num label="X" step={0.01} value={rt.pivot.x} onChange={(v) => set(setPivotKeepRect(rt, parentSize, { ...rt.pivot, x: v }), 'pivot')} />
        <Num label="Y" step={0.01} value={rt.pivot.y} onChange={(v) => set(setPivotKeepRect(rt, parentSize, { ...rt.pivot, y: v }), 'pivot')} />
      </Row>
      </div>
      <Row label="Rotation Z">
        <Num value={rt.rotation} step={0.5} onChange={(v) => set({ ...rt, rotation: v }, 'rot')} />
      </Row>
      <Row label="Scale">
        <Num label="X" step={0.01} value={rt.scale.x} onChange={(v) => set({ ...rt, scale: { ...rt.scale, x: v } }, 'sx')} />
        <Num label="Y" step={0.01} value={rt.scale.y} onChange={(v) => set({ ...rt, scale: { ...rt.scale, y: v } }, 'sy')} />
      </Row>
      <div className="note small">Đổi anchor/pivot giữ nguyên vị trí hiển thị trên máy đang chọn, giống Inspector của Unity.</div>
    </Section>
  )
}

function ImageInspector({ node }: { node: LayoutNode }) {
  const sprites = useStore((s) => s.doc.sprites)
  const images = useStore((s) => s.images)
  const img = node.image!
  const set = (patch: Partial<typeof img>, key: string) =>
    updateNode(node.id, (n) => ({ ...n, image: { ...n.image!, ...patch } }), { mergeKey: `${node.id}:${key}` })
  const sprite = sprites.find((s) => s.id === img.sprite)
  return (
    <Section title="Image">
      <Row label="Sprite">
        <div className="sprite-pick">
          {sprite && images[sprite.id] && <img src={images[sprite.id].url} alt="" />}
          <select value={img.sprite ?? ''} onChange={(e) => set({ sprite: e.target.value || null }, 'sprite')}>
            <option value="">(không có, ô màu)</option>
            {sprites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.file}
              </option>
            ))}
          </select>
        </div>
      </Row>
      <Row label="Color">
        <ColorField value={img.color} onChange={(c) => set({ color: c }, 'color')} />
      </Row>
      <Row label="Image Type">
        <select value={img.type} onChange={(e) => set({ type: e.target.value as ImageType }, 'type')}>
          <option>Simple</option>
          <option>Sliced</option>
          <option>Filled</option>
        </select>
        {img.type === 'Sliced' && sprite && sprite.border.every((b) => b === 0) && (
          <span className="warn">Sprite chưa có viền 9-slice</span>
        )}
      </Row>
      {img.type === 'Filled' && (
        <>
          <Row label="Fill Method">
            <select value={img.fillMethod ?? 'Radial360'} onChange={(e) => set({ fillMethod: e.target.value as FillMethod, fillOrigin: 0 }, 'fm')}>
              {['Horizontal', 'Vertical', 'Radial90', 'Radial180', 'Radial360'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Row>
          <Row label="Fill Origin">
            <select value={img.fillOrigin ?? 0} onChange={(e) => set({ fillOrigin: Number(e.target.value) }, 'fo')}>
              {FILL_ORIGINS[img.fillMethod ?? 'Radial360'].map((o, i) => (
                <option key={o} value={i}>
                  {o}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Fill Amount">
            <input type="range" min={0} max={1} step={0.01} value={img.fillAmount ?? 1} onChange={(e) => set({ fillAmount: Number(e.target.value) }, 'fa')} />
            <span className="mono">{(img.fillAmount ?? 1).toFixed(2)}</span>
          </Row>
          {(img.fillMethod ?? 'Radial360').startsWith('Radial') && (
            <Check label="Clockwise" checked={img.fillClockwise ?? true} onChange={(v) => set({ fillClockwise: v }, 'fc')} />
          )}
        </>
      )}
      {img.type === 'Simple' && <Check label="Preserve Aspect" checked={img.preserveAspect} onChange={(v) => set({ preserveAspect: v }, 'pa')} />}
      <Check label="Raycast Target" checked={img.raycastTarget} onChange={(v) => set({ raycastTarget: v }, 'rc')} />
      {sprite && (
        <button
          className="btn"
          onClick={() => updateNode(node.id, (n) => ({ ...n, rect: { ...n.rect, sizeDelta: nativeSizeDelta(n, sprite.width, sprite.height) } }))}
        >
          Set Native Size ({sprite.width}×{sprite.height})
        </button>
      )}
    </Section>
  )
}

/** Set Native Size của Unity: chỉ đặt được trên trục không kéo giãn. */
function nativeSizeDelta(n: LayoutNode, w: number, h: number) {
  const r = n.rect
  return {
    x: r.anchorMin.x === r.anchorMax.x ? w : r.sizeDelta.x,
    y: r.anchorMin.y === r.anchorMax.y ? h : r.sizeDelta.y,
  }
}

function TextInspector({ node }: { node: LayoutNode }) {
  const fonts = useStore((s) => s.fonts)
  const t = node.text!
  const set = (patch: Partial<typeof t>, key: string) =>
    updateNode(node.id, (n) => ({ ...n, text: { ...n.text!, ...patch } }), { mergeKey: `${node.id}:${key}` })
  const fontNames = Array.from(new Set(['Kanit-SemiBold', ...fonts.map((f) => f.name), t.font]))
  return (
    <Section title="Text (TextMeshPro)">
      <textarea value={t.content} rows={3} onChange={(e) => set({ content: e.target.value }, 'content')} />
      <Row label="Font">
        <input list="font-list" value={t.font} onChange={(e) => set({ font: e.target.value }, 'font')} />
        <datalist id="font-list">
          {fontNames.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Row>
      <Row label="Font Size">
        <Num value={t.fontSize} min={1} disabled={t.autoSize} onChange={(v) => set({ fontSize: v }, 'fs')} />
        <Check label="Auto Size" checked={t.autoSize} onChange={(v) => set({ autoSize: v }, 'as')} />
      </Row>
      {t.autoSize && (
        <Row label="Min / Max">
          <Num label="Min" value={t.fontSizeMin} min={1} onChange={(v) => set({ fontSizeMin: v }, 'fmin')} />
          <Num label="Max" value={t.fontSizeMax} min={1} onChange={(v) => set({ fontSizeMax: v }, 'fmax')} />
        </Row>
      )}
      <Row label="Color">
        <ColorField value={t.color} onChange={(c) => set({ color: c }, 'color')} />
      </Row>
      <Row label="Style">
        <Check label="Bold" checked={t.bold} onChange={(v) => set({ bold: v }, 'b')} />
        <Check label="Italic" checked={t.italic} onChange={(v) => set({ italic: v }, 'i')} />
        <Check label="Wrap" checked={t.wrap} onChange={(v) => set({ wrap: v }, 'wrap')} />
      </Row>
      <Row label="Align">
        <div className="seg">
          {(['Left', 'Center', 'Right'] as HAlign[]).map((a) => (
            <button key={a} className={t.hAlign === a ? 'on' : ''} onClick={() => set({ hAlign: a }, 'ha')}>
              {a === 'Left' ? '⇤' : a === 'Center' ? '↔' : '⇥'}
            </button>
          ))}
        </div>
        <div className="seg">
          {(['Top', 'Middle', 'Bottom'] as VAlign[]).map((a) => (
            <button key={a} className={t.vAlign === a ? 'on' : ''} onClick={() => set({ vAlign: a }, 'va')}>
              {a === 'Top' ? '⤒' : a === 'Middle' ? '↕' : '⤓'}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Spacing">
        <Num label="Line" value={t.lineSpacing} onChange={(v) => set({ lineSpacing: v }, 'ls')} />
        <Num label="Char" value={t.characterSpacing} onChange={(v) => set({ characterSpacing: v }, 'cs')} />
      </Row>
      <div className="note small">Chữ trên web chỉ xem gần đúng: TextMeshPro dựng chữ khác trình duyệt. Vị trí và khung chữ thì khớp Unity.</div>
    </Section>
  )
}
