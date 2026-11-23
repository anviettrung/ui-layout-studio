// Vẽ cây node bằng các div lồng nhau. Mỗi div đặt theo rect cục bộ (Y lên → dùng CSS bottom),
// xoay/scale quanh pivot, nên CSS ghép biến đổi giống hệt hierarchy của Unity.
import { memo, useLayoutEffect, useReducer, useRef, type CSSProperties } from 'react'
import type { ResolvedNode } from '../model/layout'
import type { Color, ImageData, SpriteAsset, TextData } from '../model/types'
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
  if (!isRoot && (rt.rotation !== 0 || rt.scale.x !== 1 || rt.scale.y !== 1)) {
    style.transformOrigin = `${rt.pivot.x * 100}% ${(1 - rt.pivot.y) * 100}%`
    style.transform = `rotate(${-rt.rotation}deg) scale(${rt.scale.x}, ${rt.scale.y})`
  }
  return (
    <div className="node" data-node-id={node.id} data-selectable={selectable ? '1' : undefined} style={style}>
      {node.type === 'Image' && node.image && <ImageView img={node.image} ctx={ctx} />}
      {node.type === 'Text' && node.text && <TextView t={node.text} />}
      {r.children.map((c) => (
        <NodeView key={c.node.id} r={c} ctx={ctx} locked={lock} />
      ))}
    </div>
  )
})

function ImageView({ img, ctx }: { img: ImageData; ctx: RenderCtx }) {
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const sprite = img.sprite ? ctx.sprites[img.sprite] : undefined
  const src = img.sprite ? ctx.images[img.sprite] : undefined
  const fill: CSSProperties = { position: 'absolute', inset: 0 }
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
      return el.scrollHeight <= box.clientHeight + 0.5 && el.scrollWidth <= box.clientWidth + 0.5
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
    <div ref={ref} className="text-box" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: V[t.vAlign], justifyContent: 'stretch' }}>
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
