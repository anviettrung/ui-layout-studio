// Khung nhìn một thiết bị: vẽ layout đúng kích thước canvas của máy đó, chọn/kéo/resize node, snap.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import {
  apply, canvasFrame, cornersOf, deviceScreen, fitRect, invert, resolveTree, worldMatrices,
  type CanvasFrame, type Mat, type Rect, type ResolvedNode,
} from '../model/layout'
import { createNode } from '../model/defaults'
import type { DeviceProfile, LayoutNode, Vec2 } from '../model/types'
import { findNode, insertNode } from '../model/tree'
import { checkpoint, getState, setState, updateDoc, updateNode, useStore } from '../store'
import { addPngFiles } from '../io'
import { NodeView, type RenderCtx } from './NodeView'

interface Layout {
  frame: CanvasFrame
  tree: ResolvedNode
  mats: Map<string, Mat>
  byId: Map<string, ResolvedNode>
  parentOf: Map<string, string>
}

export function computeLayout(root: LayoutNode, frame: CanvasFrame): Layout {
  const tree = resolveTree(root, frame)
  const mats = worldMatrices(tree)
  const byId = new Map<string, ResolvedNode>()
  const parentOf = new Map<string, string>()
  const visit = (r: ResolvedNode) => {
    byId.set(r.node.id, r)
    r.children.forEach((c) => {
      parentOf.set(c.node.id, r.node.id)
      visit(c)
    })
  }
  visit(tree)
  return { frame, tree, mats, byId, parentOf }
}

interface Guide {
  axis: 'x' | 'y'
  /** toạ độ canvas */
  pos: number
}

type Drag =
  | { kind: 'move'; id: string; start: Vec2; startAP: Vec2; parentInv: Mat; startWorld: Rect | null; moved: boolean }
  | { kind: 'resize'; id: string; hx: number; hy: number; startLocal: Rect; nodeInv: Mat; start: Vec2; parentSize: Vec2; aspect: number; snapWorld: { dx: number; dy: number } | null }
  | { kind: 'pan'; start: Vec2; startPan: Vec2 }

const HANDLES: [number, number][] = [
  [0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1],
]

interface Props {
  device: DeviceProfile
  /** grid: luôn vừa khung, không pan */
  compact?: boolean
}

export function Viewport({ device, compact }: Props) {
  const doc = useStore((s) => s.doc)
  const images = useStore((s) => s.images)
  const selection = useStore((s) => s.selection)
  const zoom = useStore((s) => s.zoom)
  const showSafe = useStore((s) => s.showSafeArea)
  const showBounds = useStore((s) => s.showBounds)
  const overlay = useStore((s) => s.overlay)

  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [hostSize, setHostSize] = useState({ w: 800, h: 600 })
  const [pan, setPan] = useState<Vec2 | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const dragRef = useRef<Drag | null>(null)
  const spaceDown = useSpaceKey()

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setHostSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const screen = useMemo(() => deviceScreen(device, doc.canvas), [device, doc.canvas])
  const frame = useMemo(() => canvasFrame(doc.canvas, screen), [doc.canvas, screen])
  const layout = useMemo(() => computeLayout(doc.root, frame), [doc.root, frame])
  const sprites = useMemo(() => Object.fromEntries(doc.sprites.map((s) => [s.id, s])), [doc.sprites])
  const ctx: RenderCtx = useMemo(() => ({ sprites, images, interactive: true }), [sprites, images])

  const pad = compact ? 8 : 40
  const fitScale = Math.max(0.02, Math.min((hostSize.w - pad * 2) / frame.size.x, (hostSize.h - pad * 2) / frame.size.y))
  const vs = compact || zoom === 'fit' ? fitScale : zoom
  const stageW = frame.size.x * vs
  const stageH = frame.size.y * vs
  const centered = { x: (hostSize.w - stageW) / 2, y: (hostSize.h - stageH) / 2 }
  const offset = compact || zoom === 'fit' || !pan ? centered : pan

  // Khi chuyển về fit thì bỏ pan
  useEffect(() => {
    if (zoom === 'fit') setPan(null)
  }, [zoom])

  // canvas (Y lên) → toạ độ màn hình trong stage (Y xuống)
  const toStage = useCallback((p: Vec2) => ({ x: p.x * vs, y: (frame.size.y - p.y) * vs }), [vs, frame.size.y])
  const clientToCanvas = useCallback(
    (cx: number, cy: number): Vec2 => {
      const r = stageRef.current!.getBoundingClientRect()
      return { x: (cx - r.left) / vs, y: frame.size.y - (cy - r.top) / vs }
    },
    [vs, frame.size.y],
  )

  // ---------- Snap ----------
  const snapThreshold = 6 / vs
  function snapTargets(id: string): { xs: number[]; ys: number[] } {
    const xs: number[] = [0, frame.size.x / 2, frame.size.x]
    const ys: number[] = [0, frame.size.y / 2, frame.size.y]
    const s = frame.safe
    xs.push(s.x, s.x + s.width)
    ys.push(s.y, s.y + s.height)
    const parentId = layout.parentOf.get(id)
    const parent = parentId ? layout.byId.get(parentId) : undefined
    if (parent) {
      const w = parent.world
      xs.push(w.x, w.x + w.width / 2, w.x + w.width)
      ys.push(w.y, w.y + w.height / 2, w.y + w.height)
      for (const sib of parent.children) {
        if (sib.node.id === id || sib.node.editor?.hidden) continue
        const v = sib.world
        xs.push(v.x, v.x + v.width / 2, v.x + v.width)
        ys.push(v.y, v.y + v.height / 2, v.y + v.height)
      }
    }
    return { xs, ys }
  }
  function bestSnap(values: number[], targets: number[]): { delta: number; pos: number } | null {
    let best: { delta: number; pos: number } | null = null
    for (const v of values)
      for (const t of targets) {
        const d = t - v
        if (Math.abs(d) <= snapThreshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, pos: t }
      }
    return best
  }
  /** Không xoay/scale ở node và tổ tiên thì mới snap theo khung thẳng được. */
  function isAxisAligned(id: string): boolean {
    const m = layout.mats.get(id)
    return !!m && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[3] - 1) < 1e-6
  }

  // ---------- Pointer ----------
  function beginMove(e: RPointerEvent, id: string) {
    const node = layout.byId.get(id)
    const parentId = layout.parentOf.get(id)
    if (!node || !parentId) return
    const pm = layout.mats.get(parentId)!
    checkpoint()
    dragRef.current = {
      kind: 'move', id, start: clientToCanvas(e.clientX, e.clientY), startAP: { ...node.node.rect.anchoredPosition },
      parentInv: invert(pm), startWorld: isAxisAligned(id) ? { ...node.world } : null, moved: false,
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onNodePointerDown(e: RPointerEvent) {
    if (e.button === 1 || spaceDown.current) return startPan(e)
    if (e.button !== 0) return
    const el = (e.target as HTMLElement).closest('[data-selectable]') as HTMLElement | null
    if (!el) {
      setState({ selection: null, selectedSprite: null })
      return startPan(e)
    }
    e.stopPropagation()
    const id = el.dataset.nodeId!
    setState({ selection: id, selectedSprite: null })
    beginMove(e, id)
  }

  function onBodyPointerDown(e: RPointerEvent) {
    if (e.button === 1 || spaceDown.current) return startPan(e)
    if (e.button !== 0 || !selection) return
    e.stopPropagation()
    beginMove(e, selection)
  }

  function onHandlePointerDown(e: RPointerEvent, hx: number, hy: number) {
    if (!selection || e.button !== 0) return
    e.stopPropagation()
    const node = layout.byId.get(selection)
    const parentId = layout.parentOf.get(selection)
    if (!node || !parentId) return
    const parent = layout.byId.get(parentId)!
    checkpoint()
    const start = apply(invert(layout.mats.get(selection)!), clientToCanvas(e.clientX, e.clientY))
    dragRef.current = {
      kind: 'resize', id: selection, hx, hy, startLocal: { ...node.local }, nodeInv: invert(layout.mats.get(selection)!), start,
      parentSize: { x: parent.local.width, y: parent.local.height }, aspect: node.local.width / Math.max(1e-6, node.local.height),
      snapWorld: isAxisAligned(selection) ? { dx: node.world.x - node.local.x, dy: node.world.y - node.local.y } : null,
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function startPan(e: RPointerEvent) {
    if (compact) return
    dragRef.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, startPan: { ...offset } }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: RPointerEvent) {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      if (zoom === 'fit') setState({ zoom: vs })
      setPan({ x: d.startPan.x + e.clientX - d.start.x, y: d.startPan.y + e.clientY - d.start.y })
      return
    }
    const p = clientToCanvas(e.clientX, e.clientY)
    if (d.kind === 'move') {
      let dx = p.x - d.start.x
      let dy = p.y - d.start.y
      if (!d.moved && Math.hypot(dx, dy) * vs < 3) return
      d.moved = true
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      const g: Guide[] = []
      if (getState().snap && !e.altKey && d.startWorld) {
        const w = d.startWorld
        const t = snapTargets(d.id)
        const sx = bestSnap([w.x + dx, w.x + dx + w.width / 2, w.x + dx + w.width], t.xs)
        const sy = bestSnap([w.y + dy, w.y + dy + w.height / 2, w.y + dy + w.height], t.ys)
        if (sx) { dx += sx.delta; g.push({ axis: 'x', pos: sx.pos }) }
        if (sy) { dy += sy.delta; g.push({ axis: 'y', pos: sy.pos }) }
      }
      setGuides(g)
      // đổi độ dời trên canvas sang toạ độ của cha (bỏ phần tịnh tiến)
      const inv = d.parentInv
      const lx = inv[0] * dx + inv[2] * dy
      const ly = inv[1] * dx + inv[3] * dy
      const ap = { x: round(d.startAP.x + lx), y: round(d.startAP.y + ly) }
      updateNode(d.id, (n) => ({ ...n, rect: { ...n.rect, anchoredPosition: ap } }), { history: 'none' })
      return
    }
    if (d.kind === 'resize') {
      const lp = apply(d.nodeInv, p)
      let ddx = lp.x - d.start.x
      let ddy = lp.y - d.start.y
      const r = { ...d.startLocal }
      const g: Guide[] = []
      // snap cạnh đang kéo
      if (getState().snap && !e.altKey && d.snapWorld) {
        const t = snapTargets(d.id)
        if (d.hx !== 0.5) {
          const edge = d.snapWorld.dx + r.x + (d.hx === 1 ? r.width : 0) + ddx
          const s = bestSnap([edge], t.xs)
          if (s) { ddx += s.delta; g.push({ axis: 'x', pos: s.pos }) }
        }
        if (d.hy !== 0.5) {
          const edge = d.snapWorld.dy + r.y + (d.hy === 1 ? r.height : 0) + ddy
          const s = bestSnap([edge], t.ys)
          if (s) { ddy += s.delta; g.push({ axis: 'y', pos: s.pos }) }
        }
      }
      if (d.hx === 0) { r.x += ddx; r.width -= ddx }
      if (d.hx === 1) r.width += ddx
      if (d.hy === 0) { r.y += ddy; r.height -= ddy }
      if (d.hy === 1) r.height += ddy
      if (e.shiftKey && d.hx !== 0.5 && d.hy !== 0.5) {
        // giữ tỉ lệ theo cạnh thay đổi nhiều hơn
        const w = Math.abs(r.width), h = Math.abs(r.height)
        if (w / d.aspect > h) {
          const nh = w / d.aspect
          if (d.hy === 0) r.y -= nh - r.height
          r.height = nh
        } else {
          const nw = h * d.aspect
          if (d.hx === 0) r.x -= nw - r.width
          r.width = nw
        }
      }
      setGuides(g)
      const rounded = { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) }
      updateNode(d.id, (n) => ({ ...n, rect: fitRect(n.rect, d.parentSize, rounded) }), { history: 'none' })
    }
  }

  function onPointerUp(e: RPointerEvent) {
    const d = dragRef.current
    dragRef.current = null
    setGuides([])
    if (d?.kind === 'move' && !d.moved) {
      // bấm (không kéo) vào khung chọn: chọn node sâu nhất bên dưới con trỏ
      const hits = document.elementsFromPoint(e.clientX, e.clientY)
      const host = hostRef.current
      const el = hits.find((h) => host?.contains(h) && (h as HTMLElement).dataset?.selectable) as HTMLElement | undefined
      if (el && el.dataset.nodeId !== d.id) setState({ selection: el.dataset.nodeId! })
      // bỏ checkpoint thừa
      setState((s) => (s.past.length && s.past[s.past.length - 1] === s.doc ? { past: s.past.slice(0, -1) } : {}))
    }
  }

  function onWheel(e: React.WheelEvent) {
    if (compact) return
    const host = hostRef.current!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.0015)
      const nz = Math.min(8, Math.max(0.05, vs * factor))
      const mx = e.clientX - host.left, my = e.clientY - host.top
      setPan({ x: mx - ((mx - offset.x) * nz) / vs, y: my - ((my - offset.y) * nz) / vs })
      setState({ zoom: nz })
    } else {
      if (zoom === 'fit') setState({ zoom: vs })
      setPan({ x: offset.x - e.deltaX, y: offset.y - e.deltaY })
    }
  }

  // ctrl+wheel phải chặn zoom trang: cần listener không passive
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const h = (e: WheelEvent) => { if (!compact) e.preventDefault() }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [compact])

  // ---------- Thả sprite / PNG ----------
  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('application/x-uls-sprite') || e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const at = clientToCanvas(e.clientX, e.clientY)
    const spriteId = e.dataTransfer.getData('application/x-uls-sprite')
    const ids = spriteId ? [spriteId] : await addPngFiles(Array.from(e.dataTransfer.files))
    ids.forEach((id, i) => placeSprite(id, { x: at.x + i * 20, y: at.y - i * 20 }))
  }
  function placeSprite(spriteId: string, at: Vec2) {
    const s = getState()
    const sprite = s.doc.sprites.find((x) => x.id === spriteId)
    if (!sprite) return
    const parentId = dropParent(s.doc.root, s.selection)
    const parent = layout.byId.get(parentId)
    const pm = layout.mats.get(parentId)
    if (!parent || !pm) return
    const lp = apply(invert(pm), at)
    const node = createNode('Image', sprite.file.replace(/\.png$/i, ''))
    node.image!.sprite = spriteId
    node.rect.sizeDelta = { x: sprite.width, y: sprite.height }
    node.rect.anchoredPosition = { x: round(lp.x - parent.local.width / 2), y: round(lp.y - parent.local.height / 2) }
    if (sprite.border.some((b) => b > 0)) node.image!.type = 'Sliced'
    const p = findNode(s.doc.root, parentId)!
    updateDoc((d) => ({ ...d, root: insertNode(d.root, parentId, p.children.length, node) }))
    setState({ selection: node.id, selectedSprite: null })
  }

  // ---------- Vẽ ----------
  const sel = selection ? layout.byId.get(selection) : undefined
  const selCorners = sel && selection !== 'root' ? cornersOf(layout.mats.get(selection!)!, sel.local).map(toStage) : null
  const selType = sel?.node.type
  const canTransform = !!sel && selection !== 'root' && selType !== 'SafeArea' && !sel.node.editor?.locked
  const anchorMarks = sel && canTransform ? anchorPoints(layout, sel.node.id).map(toStage) : []

  const s = frame.safe
  const safeRect = { x: s.x * vs, y: (frame.size.y - s.y - s.height) * vs, w: s.width * vs, h: s.height * vs }
  const hasInsets = s.x > 0 || s.y > 0 || s.width < frame.size.x - 1e-6 || s.height < frame.size.y - 1e-6

  return (
    <div
      ref={hostRef}
      className={`viewport ${compact ? 'compact' : ''} ${spaceDown.current ? 'panning' : ''}`}
      onPointerDown={onNodePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div ref={stageRef} className="stage" style={{ left: offset.x, top: offset.y, width: stageW, height: stageH }}>
        <div className="canvas" style={{ width: frame.size.x, height: frame.size.y, transform: `scale(${vs})` }}>
          <NodeView r={layout.tree} ctx={ctx} locked={false} isRoot />
          {overlay?.visible && (
            <img
              className="ref-overlay"
              src={overlay.url}
              alt=""
              style={{
                width: doc.canvas.referenceResolution.x,
                height: doc.canvas.referenceResolution.y,
                left: (frame.size.x - doc.canvas.referenceResolution.x) / 2,
                top: (frame.size.y - doc.canvas.referenceResolution.y) / 2,
                opacity: overlay.opacity,
              }}
            />
          )}
        </div>
        <svg className="overlay" width={stageW} height={stageH}>
          {showSafe && hasInsets && (
            <>
              <path
                className="unsafe"
                fillRule="evenodd"
                d={`M0 0H${stageW}V${stageH}H0Z M${safeRect.x} ${safeRect.y}h${safeRect.w}v${safeRect.h}h${-safeRect.w}Z`}
              />
              <rect className="safe-line" x={safeRect.x} y={safeRect.y} width={safeRect.w} height={safeRect.h} />
            </>
          )}
          {showBounds && !compact && <Bounds layout={layout} toStage={toStage} selection={selection} />}
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <line key={i} className="guide" x1={g.pos * vs} x2={g.pos * vs} y1={0} y2={stageH} />
            ) : (
              <line key={i} className="guide" y1={(frame.size.y - g.pos) * vs} y2={(frame.size.y - g.pos) * vs} x1={0} x2={stageW} />
            ),
          )}
          {selCorners && (
            <polygon
              className={`sel ${canTransform ? 'body' : ''}`}
              points={selCorners.map((p) => `${p.x},${p.y}`).join(' ')}
              onPointerDown={canTransform ? onBodyPointerDown : undefined}
            />
          )}
          {anchorMarks.map((p, i) => (
            <path key={i} className="anchor-mark" d={anchorPath(p, i)} />
          ))}
          {selCorners && canTransform && sel &&
            HANDLES.map(([hx, hy]) => {
              const m = layout.mats.get(sel.node.id)!
              const p = toStage(apply(m, { x: sel.local.width * hx, y: sel.local.height * hy }))
              const sz = compact ? 6 : 9
              return (
                <rect
                  key={`${hx}-${hy}`}
                  className="handle"
                  x={p.x - sz / 2}
                  y={p.y - sz / 2}
                  width={sz}
                  height={sz}
                  style={{ cursor: handleCursor(hx, hy) }}
                  onPointerDown={(e) => onHandlePointerDown(e, hx, hy)}
                />
              )
            })}
        </svg>
      </div>
    </div>
  )
}

function Bounds({ layout, toStage, selection }: { layout: Layout; toStage: (p: Vec2) => Vec2; selection: string | null }) {
  const lines: string[] = []
  const visit = (r: ResolvedNode, hidden: boolean) => {
    const h = hidden || !!r.node.editor?.hidden || !r.node.active
    if (!h && r.node.id !== 'root' && r.node.id !== selection && r.node.type !== 'SafeArea') {
      const pts = cornersOf(layout.mats.get(r.node.id)!, r.local).map(toStage)
      lines.push(pts.map((p) => `${p.x},${p.y}`).join(' '))
    }
    r.children.forEach((c) => visit(c, h))
  }
  visit(layout.tree, false)
  return (
    <g className="bounds">
      {lines.map((pts, i) => (
        <polygon key={i} points={pts} />
      ))}
    </g>
  )
}

/** Điểm neo của node trên canvas: 4 góc của khung anchor trong cha. */
function anchorPoints(layout: Layout, id: string): Vec2[] {
  const r = layout.byId.get(id)
  const pid = layout.parentOf.get(id)
  if (!r || !pid) return []
  const p = layout.byId.get(pid)!
  const m = layout.mats.get(pid)!
  const a = r.node.rect
  const W = p.local.width, H = p.local.height
  return [
    apply(m, { x: W * a.anchorMin.x, y: H * a.anchorMin.y }),
    apply(m, { x: W * a.anchorMin.x, y: H * a.anchorMax.y }),
    apply(m, { x: W * a.anchorMax.x, y: H * a.anchorMax.y }),
    apply(m, { x: W * a.anchorMax.x, y: H * a.anchorMin.y }),
  ]
}

/** Hình tam giác nhỏ chỉ vào điểm neo (giống Unity). */
function anchorPath(p: Vec2, i: number): string {
  const s = 8
  const dx = i === 0 || i === 1 ? -1 : 1
  const dy = i === 0 || i === 3 ? 1 : -1
  return `M${p.x} ${p.y} L${p.x + dx * s} ${p.y + dy * s * 0.4} L${p.x + dx * s * 0.4} ${p.y + dy * s} Z`
}

function handleCursor(hx: number, hy: number): string {
  if (hx === 0.5) return 'ns-resize'
  if (hy === 0.5) return 'ew-resize'
  return (hx === 0) === (hy === 0) ? 'nesw-resize' : 'nwse-resize'
}

/** Node mới thả vào: trong node đang chọn nếu là nhóm, không thì cạnh nó; mặc định vào SafeArea. */
export function dropParent(root: LayoutNode, selection: string | null): string {
  if (selection) {
    const n = findNode(root, selection)
    if (n && (n.type === 'Group' || n.type === 'SafeArea')) return n.id
    if (n) {
      const parent = findParentId(root, selection)
      if (parent) return parent
    }
  }
  return root.children.find((c) => c.type === 'SafeArea')?.id ?? root.id
}

function findParentId(root: LayoutNode, id: string): string | null {
  for (const c of root.children) {
    if (c.id === id) return root.id
    const f = findParentId(c, id)
    if (f) return f
  }
  return null
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

function useSpaceKey() {
  const ref = useRef(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) ref.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') ref.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return ref
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
