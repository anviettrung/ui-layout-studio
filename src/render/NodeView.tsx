// Vẽ cây node bằng các div lồng nhau. Mỗi div đặt theo rect cục bộ (Y lên → dùng CSS bottom),
// xoay/scale quanh pivot, nên CSS ghép biến đổi giống hệt hierarchy của Unity.
import { memo, useLayoutEffect, useReducer, useRef, type CSSProperties } from 'react'
import type { ResolvedNode } from '../model/layout'
import type { Color, ImageData, LayoutNode, SpriteAsset, TextData } from '../model/types'
import type { SpriteImage } from '../store'
import { tintedUrl } from './tint'

export interface RenderCtx {
  sprites: Record<string, SpriteAsset>
  images: Record<string, SpriteImage>
  interactive: boolean
}

export function css(c: Color, alphaMul = 1): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a * alphaMul})`
}

interface Props {
  r: ResolvedNode
  ctx: RenderCtx
  locked: boolean
  isRoot?: boolean
}

export const NodeView = memo(function NodeView({ r, ctx, locked, isRoot }: Props) {
  const { node, local } = r
  if (node.editor?.hidden || !node.active) return null
  const lock = locked || !!node.editor?.locked
  const rt = node.rect
  const selectable = ctx.interactive && !lock && (node.type === 'Image' || node.type === 'Text')
  const style: CSSProperties = {
    position: 'absolute',
    left: local.x,
    bottom: local.y,
    width: Math.max(0, local.width),
    height: Math.max(0, local.height),
    pointerEvents: selectable ? 'auto' : 'none',
  }
  Object.assign(style, maskStyle(node, ctx))
  if (!isRoot && (rt.rotation !== 0 || rt.scale.x !== 1 || rt.scale.y !== 1)) {
    style.transformOrigin = `${rt.pivot.x * 100}% ${(1 - rt.pivot.y) * 100}%`
    style.transform = `rotate(${-rt.rotation}deg) scale(${rt.scale.x}, ${rt.scale.y})`
  }
  return (
    <div className="node" data-node-id={node.id} data-selectable={selectable ? '1' : undefined} style={style}>
      {node.type === 'Image' && node.image && !(node.mask?.type === 'Mask' && !node.mask.showMaskGraphic) && <ImageView img={node.image} ctx={ctx} />}
      {node.type === 'Text' && node.text && <TextView t={node.text} />}
      {r.children.map((c) => (
        <NodeView key={c.node.id} r={c} ctx={ctx} locked={lock} />
      ))}
    </div>
  )
})

/**
 * Mask: cắt node và mọi con theo hình sprite của Image cùng node (alpha), RectMask2D: cắt theo khung.
 * Mask không có sprite thì cắt theo khung (Unity dùng hình chữ nhật của Image).
 */
function maskStyle(node: LayoutNode, ctx: RenderCtx): CSSProperties {
  const m = node.mask
  if (!m) return {}
  if (m.type === 'RectMask2D') return { clipPath: 'inset(0)' }
  const img = node.image
  const sprite = img?.sprite ? ctx.sprites[img.sprite] : undefined
  const src = img?.sprite ? ctx.images[img.sprite] : undefined
  if (!img || !sprite || !src) return { clipPath: 'inset(0)' }
  const [l, b, r, t] = sprite.border
  if (img.type === 'Sliced' && l + b + r + t > 0) {
    return { WebkitMaskBoxImage: `url("${src.url}") ${t} ${r} ${b} ${l} stretch`, WebkitMaskBoxImageWidth: `${t}px ${r}px ${b}px ${l}px` } as CSSProperties
  }
  return { maskImage: `url("${src.url}")`, maskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskImage: `url("${src.url}")`, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat' }
}

/** Image kiểu Filled: phần hiện theo fillAmount, hướng theo fillMethod/fillOrigin như Unity. */
function fillStyle(img: ImageData): CSSProperties {
  if (img.type !== 'Filled') return {}
  const a = Math.min(1, Math.max(0, img.fillAmount ?? 1))
  if (a >= 1) return {}
  const o = img.fillOrigin ?? 0
  const cw = img.fillClockwise ?? true
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`
  switch (img.fillMethod ?? 'Radial360') {
    case 'Horizontal':
      return { clipPath: o === 1 ? `inset(0 0 0 ${pct(1 - a)})` : `inset(0 ${pct(1 - a)} 0 0)` }
    case 'Vertical':
      return { clipPath: o === 1 ? `inset(0 0 ${pct(1 - a)} 0)` : `inset(${pct(1 - a)} 0 0 0)` }
    default: {
      // conic-gradient: góc tính theo chiều kim đồng hồ từ hướng 12 giờ
      let at = '50% 50%', from = 0, sweep = 360
      const method = img.fillMethod ?? 'Radial360'
      if (method === 'Radial360') from = [180, 90, 0, 270][o % 4]
      else if (method === 'Radial180') {
        sweep = 180
        at = ['50% 100%', '0% 50%', '50% 0%', '100% 50%'][o % 4]
        from = [270, 0, 90, 180][o % 4]
      } else {
        sweep = 90
        at = ['0% 100%', '0% 0%', '100% 0%', '100% 100%'][o % 4]
        from = [0, 90, 180, 270][o % 4]
      }
      const deg = a * sweep
      const g = cw
        ? `conic-gradient(from ${from}deg at ${at}, #000 0deg ${deg}deg, transparent ${deg}deg 360deg)`
        : `conic-gradient(from ${from + sweep - deg}deg at ${at}, #000 0deg ${deg}deg, transparent ${deg}deg 360deg)`
      return { maskImage: g, WebkitMaskImage: g }
    }
  }
}

function ImageView({ img, ctx }: { img: ImageData; ctx: RenderCtx }) {
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const sprite = img.sprite ? ctx.sprites[img.sprite] : undefined
  const src = img.sprite ? ctx.images[img.sprite] : undefined
  const fill: CSSProperties = { position: 'absolute', inset: 0, ...fillStyle(img) }
  if (img.type === 'Filled' && (img.fillAmount ?? 1) <= 0) return null
  if (!img.sprite) return <div style={{ ...fill, background: css(img.color) }} />
  if (!sprite || !src) return <div className="missing-sprite" style={fill} title="Thiếu ảnh sprite" />
  const url = tintedUrl(src.url, img.color, rerender) ?? src.url
  const opacity = img.color.a
  const [l, b, r, t] = sprite.border
  if (img.type === 'Sliced' && l + b + r + t > 0) {
    return (
      <div
        style={{
          ...fill,
          opacity,
          boxSizing: 'border-box',
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderWidth: `${t}px ${r}px ${b}px ${l}px`,
          borderImageSource: `url("${url}")`,
          borderImageSlice: `${t} ${r} ${b} ${l} fill`,
          borderImageWidth: `${t}px ${r}px ${b}px ${l}px`,
          borderImageRepeat: 'stretch',
        }}
      />
    )
  }
  return (
    <img
      src={url}
      draggable={false}
      alt=""
      style={{ ...fill, width: '100%', height: '100%', opacity, objectFit: img.preserveAspect ? 'contain' : 'fill' }}
    />
  )
}

const H = { Left: 'left', Center: 'center', Right: 'right' } as const
const V = { Top: 'flex-start', Middle: 'center', Bottom: 'flex-end' } as const

function TextView({ t }: { t: TextData }) {
  const ref = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  // Auto size: tìm cỡ chữ lớn nhất vừa khung (như TMP enableAutoSizing).
  useLayoutEffect(() => {
    const box = ref.current, el = inner.current
    if (!box || !el) return
    if (!t.autoSize) {
      el.style.fontSize = `${t.fontSize}px`
      return
    }
    let lo = t.fontSizeMin, hi = t.fontSizeMax
    const fits = (s: number) => {
      el.style.fontSize = `${s}px`
      const m = t.margin ?? { left: 0, top: 0, right: 0, bottom: 0 }
      return el.scrollHeight <= box.clientHeight - m.top - m.bottom + 0.5 && el.scrollWidth <= box.clientWidth - m.left - m.right + 0.5
    }
    if (fits(hi)) return
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
    el.style.fontSize = `${lo}px`
  })
  return (
    <div ref={ref} className="text-box" style={{ position: 'absolute', inset: 0, padding: t.margin ? `${t.margin.top}px ${t.margin.right}px ${t.margin.bottom}px ${t.margin.left}px` : undefined, boxSizing: 'border-box', display: 'flex', alignItems: V[t.vAlign], justifyContent: 'stretch' }}>
      <div
        ref={inner}
        style={{
          width: '100%',
          fontFamily: `"${t.font}", sans-serif`,
          fontSize: t.fontSize,
          color: css(t.color),
          fontWeight: t.bold ? 700 : 400,
          fontStyle: t.italic ? 'italic' : 'normal',
          textAlign: H[t.hAlign],
          whiteSpace: t.wrap ? 'pre-wrap' : 'pre',
          overflowWrap: t.wrap ? 'break-word' : 'normal',
          lineHeight: 1.25 + t.lineSpacing / 100,
          letterSpacing: `${t.characterSpacing / 100}em`,
        }}
      >
        {t.content}
      </div>
    </div>
  )
}
