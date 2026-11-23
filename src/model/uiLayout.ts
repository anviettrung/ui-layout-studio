// Chép thuật toán layout của uGUI (com.unity.ugui 2.0, Runtime/UGUI/UI/Core/Layout):
// LayoutRebuilder, LayoutUtility, HorizontalOrVerticalLayoutGroup, GridLayoutGroup, ContentSizeFitter.
// Đầu vào là cây node của tài liệu, đầu ra là bản sao có RectTransform đã bị layout điều khiển.
// Tài liệu gốc không đổi: layout tính lại cho từng máy, giống Unity tính lại khi chạy.
import type { LayoutGroupData, LayoutNode, SpriteAsset, TextData, Vec2 } from './types'
import type { CanvasFrame } from './layout'
import { computeRect } from './layout'
import { normalizeNode } from './defaults'

export type Axis = 0 | 1

export interface TextMeasurer {
  /** Kích thước mong muốn của chữ (như TMP preferredWidth/Height). width: bề rộng khung để ngắt dòng, null = không ngắt. */
  (text: TextData, width: number | null): { width: number; height: number }
}

export interface LayoutContext {
  sprites: Record<string, SpriteAsset>
  measureText: TextMeasurer
}

export interface LayoutResult {
  root: LayoutNode
  /** id node bị điều khiển, kèm trục: 'x', 'y', 'xy' (giống DrivenTransformProperties). */
  driven: Map<string, { position: [boolean, boolean]; size: [boolean, boolean]; by: string }>
}

interface W {
  node: LayoutNode
  parent: W | null
  children: W[]
  active: boolean
  /** kích thước rect hiện tại */
  size: Vec2
  /** đầu vào layout của chính LayoutGroup trên node (totalMin/Preferred/Flexible) */
  groupInput: [{ min: number; pref: number; flex: number }, { min: number; pref: number; flex: number }]
  rectChildren: W[]
}

const ANCHORS = ['UpperLeft', 'UpperCenter', 'UpperRight', 'MiddleLeft', 'MiddleCenter', 'MiddleRight', 'LowerLeft', 'LowerCenter', 'LowerRight']
const CORNERS = ['UpperLeft', 'UpperRight', 'LowerLeft', 'LowerRight']

const f32 = Math.fround

export function hasLayoutWork(root: LayoutNode): boolean {
  if (root.layoutGroup || root.contentSizeFitter) return true
  return root.children.some(hasLayoutWork)
}

export function applyUILayout(root: LayoutNode, frame: CanvasFrame, ctx: LayoutContext): LayoutResult {
  const driven: LayoutResult['driven'] = new Map()
  if (!hasLayoutWork(root)) return { root, driven }
  root = normalizeNode(root)

  // Bản sao có thể sửa rect (chỉ sao rect, phần khác dùng chung)
  const build = (node: LayoutNode, parent: W | null, parentActive: boolean): W => {
    const w: W = {
      node: { ...node, rect: structuredClone(node.rect) },
      parent,
      children: [],
      active: parentActive && node.active,
      size: { x: 0, y: 0 },
      groupInput: [{ min: 0, pref: 0, flex: 0 }, { min: 0, pref: 0, flex: 0 }],
      rectChildren: [],
    }
    w.children = node.children.map((c) => build(c, w, w.active))
    w.node.children = w.children.map((c) => c.node)
    return w
  }
  const tree = build(root, null, true)

  const sizeOf = (w: W): Vec2 => {
    if (!w.parent) return { x: frame.size.x, y: frame.size.y }
    if (w.node.type === 'SafeArea') return { x: frame.safe.width, y: frame.safe.height }
    const r = computeRect(w.parent.size, w.node.rect)
    return { x: r.width, y: r.height }
  }
  const resize = (w: W) => {
    w.size = sizeOf(w)
    w.children.forEach(resize)
  }
  resize(tree)

  const markDriven = (w: W, by: string, axis: Axis, size: boolean) => {
    const d = driven.get(w.node.id) ?? { position: [false, false] as [boolean, boolean], size: [false, false] as [boolean, boolean], by }
    if (size) d.size[axis] = true
    else d.position[axis] = true
    d.by = by
    driven.set(w.node.id, d)
  }

  // ---------- ILayoutElement ----------
  type Prop = 'min' | 'pref' | 'flex'
  /** Các nguồn ILayoutElement trên node: [priority, min, pref, flex] theo trục */
  const elements = (w: W, axis: Axis): [number, number, number, number][] => {
    const out: [number, number, number, number][] = []
    const n = w.node
    const le = n.layoutElement
    if (le) {
      out.push([
        le.layoutPriority,
        axis === 0 ? le.minWidth : le.minHeight,
        axis === 0 ? le.preferredWidth : le.preferredHeight,
        axis === 0 ? le.flexibleWidth : le.flexibleHeight,
      ])
    }
    if (n.type === 'Image' && n.image) {
      const s = n.image.sprite ? ctx.sprites[n.image.sprite] : undefined
      let pref = 0
      if (s) {
        // Image.preferredWidth: Sliced/Tiled lấy tổng viền, còn lại lấy kích thước sprite (PPU 100 = đơn vị canvas)
        if (n.image.type === 'Sliced') pref = axis === 0 ? s.border[0] + s.border[2] : s.border[1] + s.border[3]
        else pref = axis === 0 ? s.width : s.height
      }
      out.push([0, 0, pref, -1])
    }
    if (n.type === 'Text' && n.text) {
      const t = n.text
      // TMP: preferredWidth không ngắt dòng; preferredHeight ngắt theo bề rộng hiện tại nếu bật wrap
      const m = axis === 0 ? ctx.measureText(t, null) : ctx.measureText(t, t.wrap ? w.size.x : null)
      out.push([0, 0, axis === 0 ? m.width : m.height, -1])
    }
    if (n.layoutGroup) {
      const g = w.groupInput[axis]
      out.push([0, g.min, g.pref, n.layoutGroup.type === 'Grid' ? -1 : g.flex])
    }
    return out
  }
  const prop = (w: W, axis: Axis, p: Prop): number => {
    let value = 0
    let maxPriority = -Infinity
    const idx = p === 'min' ? 1 : p === 'pref' ? 2 : 3
    for (const e of elements(w, axis)) {
      const priority = e[0]
      if (priority < maxPriority) continue
      const v = e[idx]
      if (v < 0) continue
      if (priority > maxPriority) {
        value = v
        maxPriority = priority
      } else if (v > value) value = v
    }
    return value
  }
  const minSize = (w: W, axis: Axis) => prop(w, axis, 'min')
  const preferredSize = (w: W, axis: Axis) => Math.max(prop(w, axis, 'min'), prop(w, axis, 'pref'))
  const flexibleSize = (w: W, axis: Axis) => prop(w, axis, 'flex')

  // ---------- LayoutGroup ----------
  const collectRectChildren = (w: W) => {
    w.rectChildren = w.children.filter((c) => c.active && !c.node.layoutElement?.ignoreLayout)
  }
  const padH = (g: LayoutGroupData) => g.padding.left + g.padding.right
  const padV = (g: LayoutGroupData) => g.padding.top + g.padding.bottom
  const alignment = (g: LayoutGroupData, axis: Axis) => {
    const i = Math.max(0, ANCHORS.indexOf(g.childAlignment))
    return axis === 0 ? (i % 3) * 0.5 : Math.floor(i / 3) * 0.5
  }
  const startOffset = (w: W, g: LayoutGroupData, axis: Axis, requiredWithoutPadding: number) => {
    const required = requiredWithoutPadding + (axis === 0 ? padH(g) : padV(g))
    const surplus = w.size[axis === 0 ? 'x' : 'y'] - required
    return (axis === 0 ? g.padding.left : g.padding.top) + surplus * alignment(g, axis)
  }
  const k = (axis: Axis) => (axis === 0 ? 'x' : 'y') as 'x' | 'y'

  const setChildAlongAxis = (group: W, child: W, axis: Axis, pos: number, size: number | null, scale = 1) => {
    const rt = child.node.rect
    rt.anchorMin = { x: 0, y: 1 }
    rt.anchorMax = { x: 0, y: 1 }
    const a = k(axis)
    if (size !== null) {
      rt.sizeDelta = { ...rt.sizeDelta, [a]: size }
      markDriven(child, group.node.name, axis, true)
    }
    const s = rt.sizeDelta[a]
    rt.anchoredPosition = {
      ...rt.anchoredPosition,
      [a]: axis === 0 ? pos + s * rt.pivot.x * scale : -pos - s * (1 - rt.pivot.y) * scale,
    }
    markDriven(child, group.node.name, axis, false)
  }

  const childSizes = (child: W, axis: Axis, controlSize: boolean, forceExpand: boolean) => {
    let min: number, preferred: number, flexible: number
    if (!controlSize) {
      min = child.node.rect.sizeDelta[k(axis)]
      preferred = min
      flexible = 0
    } else {
      min = minSize(child, axis)
      preferred = preferredSize(child, axis)
      flexible = flexibleSize(child, axis)
    }
    if (forceExpand) flexible = Math.max(flexible, 1)
    return { min, preferred, flexible }
  }

  const calcHV = (w: W, axis: Axis) => {
    const g = w.node.layoutGroup!
    const isVertical = g.type === 'Vertical'
    const combinedPadding = axis === 0 ? padH(g) : padV(g)
    const controlSize = axis === 0 ? g.childControlWidth : g.childControlHeight
    const useScale = axis === 0 ? g.childScaleWidth : g.childScaleHeight
    const forceExpand = axis === 0 ? g.childForceExpandWidth : g.childForceExpandHeight
    let totalMin = combinedPadding, totalPreferred = combinedPadding, totalFlexible = 0
    const alongOther = isVertical !== (axis === 1)
    for (const c of w.rectChildren) {
      let { min, preferred, flexible } = childSizes(c, axis, controlSize, forceExpand)
      if (useScale) {
        const sf = c.node.rect.scale[k(axis)]
        min *= sf
        preferred *= sf
        flexible *= sf
      }
      if (alongOther) {
        totalMin = Math.max(min + combinedPadding, totalMin)
        totalPreferred = Math.max(preferred + combinedPadding, totalPreferred)
        totalFlexible = Math.max(flexible, totalFlexible)
      } else {
        totalMin += min + g.spacing
        totalPreferred += preferred + g.spacing
        totalFlexible += flexible
      }
    }
    if (!alongOther && w.rectChildren.length > 0) {
      totalMin -= g.spacing
      totalPreferred -= g.spacing
    }
    totalPreferred = Math.max(totalMin, totalPreferred)
    w.groupInput[axis] = { min: totalMin, pref: totalPreferred, flex: totalFlexible }
  }

  const setHV = (w: W, axis: Axis) => {
    const g = w.node.layoutGroup!
    const isVertical = g.type === 'Vertical'
    const size = w.size[k(axis)]
    const controlSize = axis === 0 ? g.childControlWidth : g.childControlHeight
    const useScale = axis === 0 ? g.childScaleWidth : g.childScaleHeight
    const forceExpand = axis === 0 ? g.childForceExpandWidth : g.childForceExpandHeight
    const align = alignment(g, axis)
    const alongOther = isVertical !== (axis === 1)
    const list = g.reverseArrangement ? [...w.rectChildren].reverse() : w.rectChildren
    if (alongOther) {
      const innerSize = size - (axis === 0 ? padH(g) : padV(g))
      for (const c of list) {
        const { min, preferred, flexible } = childSizes(c, axis, controlSize, forceExpand)
        const sf = useScale ? c.node.rect.scale[k(axis)] : 1
        const requiredSpace = mathfClamp(innerSize, min, flexible > 0 ? size : preferred)
        const so = startOffset(w, g, axis, requiredSpace * sf)
        if (controlSize) setChildAlongAxis(w, c, axis, so, requiredSpace, sf)
        else {
          const offsetInCell = (requiredSpace - c.node.rect.sizeDelta[k(axis)]) * align
          setChildAlongAxis(w, c, axis, so + offsetInCell, null, sf)
        }
      }
    } else {
      const total = w.groupInput[axis]
      let pos = axis === 0 ? g.padding.left : g.padding.top
      let itemFlexibleMultiplier = 0
      const surplus = size - total.pref
      if (surplus > 0) {
        if (total.flex === 0) pos = startOffset(w, g, axis, total.pref - (axis === 0 ? padH(g) : padV(g)))
        else if (total.flex > 0) itemFlexibleMultiplier = surplus / total.flex
      }
      let minMaxLerp = 0
      if (total.min !== total.pref) minMaxLerp = Math.min(1, Math.max(0, (size - total.min) / (total.pref - total.min)))
      for (const c of list) {
        const { min, preferred, flexible } = childSizes(c, axis, controlSize, forceExpand)
        const sf = useScale ? c.node.rect.scale[k(axis)] : 1
        let childSize = min + (preferred - min) * minMaxLerp
        childSize += flexible * itemFlexibleMultiplier
        if (controlSize) setChildAlongAxis(w, c, axis, pos, childSize, sf)
        else {
          const offsetInCell = (childSize - c.node.rect.sizeDelta[k(axis)]) * align
          setChildAlongAxis(w, c, axis, pos + offsetInCell, null, sf)
        }
        pos += childSize * sf + g.spacing
      }
    }
  }

  const calcGrid = (w: W, axis: Axis) => {
    const g = w.node.layoutGroup!
    const n = w.rectChildren.length
    const cs = g.cellSize, sp = g.gridSpacing
    if (axis === 0) {
      let minColumns: number, preferredColumns: number
      if (g.constraint === 'FixedColumnCount') minColumns = preferredColumns = g.constraintCount
      else if (g.constraint === 'FixedRowCount') minColumns = preferredColumns = Math.ceil(f32(n / g.constraintCount - 0.001))
      else {
        minColumns = 1
        preferredColumns = Math.ceil(Math.sqrt(n))
      }
      w.groupInput[0] = {
        min: padH(g) + (cs.x + sp.x) * minColumns - sp.x,
        pref: padH(g) + (cs.x + sp.x) * preferredColumns - sp.x,
        flex: -1,
      }
    } else {
      let minRows: number
      if (g.constraint === 'FixedColumnCount') minRows = Math.ceil(f32(n / g.constraintCount - 0.001))
      else if (g.constraint === 'FixedRowCount') minRows = g.constraintCount
      else {
        const cellCountX = Math.max(1, Math.floor(f32((w.size.x - padH(g) + sp.x + 0.001) / (cs.x + sp.x))))
        minRows = Math.ceil(n / cellCountX)
      }
      const minSpace = padV(g) + (cs.y + sp.y) * minRows - sp.y
      w.groupInput[1] = { min: minSpace, pref: minSpace, flex: -1 }
    }
  }

  const setGrid = (w: W, axis: Axis) => {
    const g = w.node.layoutGroup!
    const n = w.rectChildren.length
    const cs = g.cellSize, sp = g.gridSpacing
    if (axis === 0) {
      for (const c of w.rectChildren) {
        c.node.rect.anchorMin = { x: 0, y: 1 }
        c.node.rect.anchorMax = { x: 0, y: 1 }
        c.node.rect.sizeDelta = { ...cs }
        markDriven(c, w.node.name, 0, true)
        markDriven(c, w.node.name, 1, true)
      }
      return
    }
    const width = w.size.x, height = w.size.y
    let cellCountX = 1, cellCountY = 1
    if (g.constraint === 'FixedColumnCount') {
      cellCountX = g.constraintCount
      if (n > cellCountX) cellCountY = Math.floor(n / cellCountX) + (n % cellCountX > 0 ? 1 : 0)
    } else if (g.constraint === 'FixedRowCount') {
      cellCountY = g.constraintCount
      if (n > cellCountY) cellCountX = Math.floor(n / cellCountY) + (n % cellCountY > 0 ? 1 : 0)
    } else {
      cellCountX = cs.x + sp.x <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(f32((width - padH(g) + sp.x + 0.001) / (cs.x + sp.x))))
      cellCountY = cs.y + sp.y <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(f32((height - padV(g) + sp.y + 0.001) / (cs.y + sp.y))))
    }
    const corner = Math.max(0, CORNERS.indexOf(g.startCorner))
    const cornerX = corner % 2, cornerY = Math.floor(corner / 2)
    const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b)
    let cellsPerMainAxis: number, actualX: number, actualY: number
    if (g.startAxis === 'Horizontal') {
      cellsPerMainAxis = cellCountX
      actualX = clamp(cellCountX, 1, n)
      actualY = g.constraint === 'FixedRowCount' ? Math.min(cellCountY, n) : clamp(cellCountY, 1, Math.ceil(n / cellsPerMainAxis))
    } else {
      cellsPerMainAxis = cellCountY
      actualY = clamp(cellCountY, 1, n)
      actualX = g.constraint === 'FixedColumnCount' ? Math.min(cellCountX, n) : clamp(cellCountX, 1, Math.ceil(n / cellsPerMainAxis))
    }
    const required = { x: actualX * cs.x + (actualX - 1) * sp.x, y: actualY * cs.y + (actualY - 1) * sp.y }
    const so = { x: startOffset(w, g, 0, required.x), y: startOffset(w, g, 1, required.y) }
    // Unity: "Fixes case 1345471"
    let childrenToMove = 0
    if (n > g.constraintCount && Math.ceil(n / cellsPerMainAxis) < g.constraintCount) {
      childrenToMove = g.constraintCount - Math.ceil(n / cellsPerMainAxis)
      childrenToMove += Math.floor(childrenToMove / (cellsPerMainAxis - 1))
      if (n % cellsPerMainAxis === 1) childrenToMove += 1
    }
    w.rectChildren.forEach((c, i) => {
      let px: number, py: number
      if (g.startAxis === 'Horizontal') {
        if (g.constraint === 'FixedRowCount' && n - i <= childrenToMove) {
          px = 0
          py = g.constraintCount - (n - i)
        } else {
          px = i % cellsPerMainAxis
          py = Math.floor(i / cellsPerMainAxis)
        }
      } else {
        if (g.constraint === 'FixedColumnCount' && n - i <= childrenToMove) {
          px = g.constraintCount - (n - i)
          py = 0
        } else {
          px = Math.floor(i / cellsPerMainAxis)
          py = i % cellsPerMainAxis
        }
      }
      if (cornerX === 1) px = actualX - 1 - px
      if (cornerY === 1) py = actualY - 1 - py
      setChildAlongAxis(w, c, 0, so.x + (cs.x + sp.x) * px, cs.x)
      setChildAlongAxis(w, c, 1, so.y + (cs.y + sp.y) * py, cs.y)
    })
  }

  // ---------- LayoutRebuilder ----------
  const calculate = (w: W, axis: Axis) => {
    if (!w.active) return
    w.children.forEach((c) => calculate(c, axis))
    const g = w.node.layoutGroup
    if (g) {
      if (axis === 0) collectRectChildren(w)
      if (g.type === 'Grid') calcGrid(w, axis)
      else calcHV(w, axis)
    }
  }

  const control = (w: W, axis: Axis) => {
    if (!w.active) return
    const fit = w.node.contentSizeFitter
    if (fit && w.parent) {
      const mode = axis === 0 ? fit.horizontalFit : fit.verticalFit
      if (mode !== 'Unconstrained') {
        const size = mode === 'MinSize' ? minSize(w, axis) : preferredSize(w, axis)
        // SetSizeWithCurrentAnchors
        const a = k(axis)
        const parentSize = w.parent.size[a]
        const rt = w.node.rect
        rt.sizeDelta = { ...rt.sizeDelta, [a]: size - parentSize * (rt.anchorMax[a] - rt.anchorMin[a]) }
        markDriven(w, 'ContentSizeFitter', axis, true)
        w.size = sizeOf(w)
      }
    }
    const g = w.node.layoutGroup
    if (g) {
      if (g.type === 'Grid') setGrid(w, axis)
      else setHV(w, axis)
    }
    for (const c of w.children) {
      c.size = sizeOf(c)
      control(c, axis)
    }
  }

  calculate(tree, 0)
  control(tree, 0)
  resize(tree)
  calculate(tree, 1)
  control(tree, 1)
  return { root: tree.node, driven }
}

/** Mathf.Clamp của Unity: khi max < min vẫn trả về max nếu value > max. */
function mathfClamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
