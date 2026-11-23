// Lõi tính layout: chép đúng công thức của Unity uGUI (RectTransform, CanvasScaler)
// và NotchSolution SafePadding. Mọi chỗ khác trong app chỉ được lấy vị trí từ đây.
import type { CanvasSettings, DeviceProfile, LayoutNode, RectTransformData, Vec2 } from './types'

/** Hình chữ nhật trong hệ toạ độ cục bộ của cha, Y hướng lên, gốc ở góc dưới trái của cha. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenInfo {
  /** pixel màn hình */
  width: number
  height: number
  safeInsets: { top: number; bottom: number; left: number; right: number }
}

/** Màn hình theo đúng hướng của canvas: canvas ngang thì xoay máy sang ngang. */
export function deviceScreen(device: DeviceProfile, canvas: CanvasSettings): ScreenInfo {
  const landscape = canvas.referenceResolution.x > canvas.referenceResolution.y
  const s = device.safeInsets
  if (!landscape) return { width: device.width, height: device.height, safeInsets: { ...s } }
  // Xoay 90° (home indicator sang phải): tai thỏ sang trái.
  return {
    width: device.height,
    height: device.width,
    safeInsets: { left: s.top, right: s.top, top: 0, bottom: s.bottom },
  }
}

/** CanvasScaler.HandleScaleWithScreenSize, mode ScaleWithScreenSize. */
export function canvasScaleFactor(canvas: CanvasSettings, screenW: number, screenH: number): number {
  const rw = canvas.referenceResolution.x
  const rh = canvas.referenceResolution.y
  switch (canvas.screenMatchMode) {
    case 'Expand':
      return Math.min(screenW / rw, screenH / rh)
    case 'Shrink':
      return Math.max(screenW / rw, screenH / rh)
    case 'MatchWidthOrHeight':
    default: {
      const logW = Math.log2(screenW / rw)
      const logH = Math.log2(screenH / rh)
      const m = Math.min(1, Math.max(0, canvas.match))
      return Math.pow(2, logW + (logH - logW) * m)
    }
  }
}

export interface CanvasFrame {
  scale: number
  /** Kích thước canvas, đơn vị canvas (= màn hình / scale). */
  size: Vec2
  /** Safe area, đơn vị canvas, Y hướng lên. */
  safe: Rect
}

export function canvasFrame(canvas: CanvasSettings, screen: ScreenInfo): CanvasFrame {
  const scale = canvasScaleFactor(canvas, screen.width, screen.height)
  const size = { x: screen.width / scale, y: screen.height / scale }
  const s = screen.safeInsets
  const safe = {
    x: s.left / scale,
    y: s.bottom / scale,
    width: (screen.width - s.left - s.right) / scale,
    height: (screen.height - s.top - s.bottom) / scale,
  }
  return { scale, size, safe }
}

/** RectTransform.rect tính từ kích thước cha: trả về rect trong toạ độ của cha. */
export function computeRect(parentSize: Vec2, rt: RectTransformData): Rect {
  const aMinX = parentSize.x * rt.anchorMin.x
  const aMinY = parentSize.y * rt.anchorMin.y
  const aMaxX = parentSize.x * rt.anchorMax.x
  const aMaxY = parentSize.y * rt.anchorMax.y
  const w = aMaxX - aMinX + rt.sizeDelta.x
  const h = aMaxY - aMinY + rt.sizeDelta.y
  const pivotX = aMinX + (aMaxX - aMinX) * rt.pivot.x + rt.anchoredPosition.x
  const pivotY = aMinY + (aMaxY - aMinY) * rt.pivot.y + rt.anchoredPosition.y
  return { x: pivotX - w * rt.pivot.x, y: pivotY - h * rt.pivot.y, width: w, height: h }
}

/**
 * Rect của SafeArea node: NotchSolution SafePadding đặt node kéo giãn toàn cha rồi chừa padding
 * bằng phần lẹm của màn hình. Ta coi cha của SafeArea luôn phủ toàn màn hình (đặt dưới gốc).
 */
export function safeAreaRect(frame: CanvasFrame): Rect {
  return { ...frame.safe }
}

export interface ResolvedNode {
  node: LayoutNode
  /** Rect trong toạ độ cha (Y lên). */
  local: Rect
  /** Rect trên canvas, bỏ qua xoay/scale (dùng cho snap, chọn). */
  world: Rect
  children: ResolvedNode[]
}

/** Tính toàn bộ cây cho một màn hình. */
export function resolveTree(root: LayoutNode, frame: CanvasFrame): ResolvedNode {
  const rootRect: Rect = { x: 0, y: 0, width: frame.size.x, height: frame.size.y }
  return resolveChildren(root, rootRect, rootRect, frame)
}

function resolveChildren(node: LayoutNode, local: Rect, world: Rect, frame: CanvasFrame): ResolvedNode {
  const size = { x: local.width, y: local.height }
  const children = node.children.map((child) => {
    const childLocal =
      child.type === 'SafeArea' ? safeAreaInParent(world, frame) : computeRect(size, child.rect)
    // world bỏ qua xoay/scale của tổ tiên: chỉ dùng cho snap và khung chọn.
    const childWorld = {
      x: world.x + childLocal.x,
      y: world.y + childLocal.y,
      width: childLocal.width,
      height: childLocal.height,
    }
    return resolveChildren(child, childLocal, childWorld, frame)
  })
  return { node, local, world, children }
}

/** SafeArea đặt trong cha bất kỳ: lấy safe area của canvas đổi sang toạ độ của cha. */
function safeAreaInParent(parentWorld: Rect, frame: CanvasFrame): Rect {
  return {
    x: frame.safe.x - parentWorld.x,
    y: frame.safe.y - parentWorld.y,
    width: frame.safe.width,
    height: frame.safe.height,
  }
}

// ---------- Chỉnh sửa RectTransform giữ nguyên vị trí hiển thị (như Unity Inspector) ----------

/** Đổi anchor nhưng giữ nguyên rect hiện tại (Unity làm vậy khi kéo anchor trong Inspector). */
export function setAnchorsKeepRect(rt: RectTransformData, parentSize: Vec2, anchorMin: Vec2, anchorMax: Vec2): RectTransformData {
  const r = computeRect(parentSize, rt)
  return fitRect({ ...rt, anchorMin, anchorMax }, parentSize, r)
}

/** Đổi pivot nhưng giữ nguyên rect. */
export function setPivotKeepRect(rt: RectTransformData, parentSize: Vec2, pivot: Vec2): RectTransformData {
  const r = computeRect(parentSize, rt)
  return fitRect({ ...rt, pivot }, parentSize, r)
}

/** Tìm anchoredPosition/sizeDelta để RectTransform (anchor, pivot cho trước) ra đúng rect r. */
export function fitRect(rt: RectTransformData, parentSize: Vec2, r: Rect): RectTransformData {
  const aMinX = parentSize.x * rt.anchorMin.x
  const aMinY = parentSize.y * rt.anchorMin.y
  const aMaxX = parentSize.x * rt.anchorMax.x
  const aMaxY = parentSize.y * rt.anchorMax.y
  const sizeDelta = { x: r.width - (aMaxX - aMinX), y: r.height - (aMaxY - aMinY) }
  const pivotX = r.x + r.width * rt.pivot.x
  const pivotY = r.y + r.height * rt.pivot.y
  const anchoredPosition = {
    x: pivotX - (aMinX + (aMaxX - aMinX) * rt.pivot.x),
    y: pivotY - (aMinY + (aMaxY - aMinY) * rt.pivot.y),
  }
  return { ...rt, sizeDelta: clean2(sizeDelta), anchoredPosition: clean2(anchoredPosition) }
}

/** Bỏ sai số dấu phẩy động kiểu 99.99999999 để số trong Inspector gọn. */
export function clean(v: number): number {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? 0 : r
}
function clean2(v: Vec2): Vec2 {
  return { x: clean(v.x), y: clean(v.y) }
}

/** Offset kiểu Unity khi anchor bị kéo giãn: Left/Right/Top/Bottom. */
export function offsets(rt: RectTransformData): { left: number; right: number; top: number; bottom: number } {
  const offsetMinX = rt.anchoredPosition.x - rt.sizeDelta.x * rt.pivot.x
  const offsetMinY = rt.anchoredPosition.y - rt.sizeDelta.y * rt.pivot.y
  const offsetMaxX = rt.anchoredPosition.x + rt.sizeDelta.x * (1 - rt.pivot.x)
  const offsetMaxY = rt.anchoredPosition.y + rt.sizeDelta.y * (1 - rt.pivot.y)
  return { left: clean(offsetMinX), bottom: clean(offsetMinY), right: clean(-offsetMaxX), top: clean(-offsetMaxY) }
}

/** Đặt lại từ Left/Right/Top/Bottom (Unity: offsetMin/offsetMax). */
export function fromOffsets(
  rt: RectTransformData,
  o: { left: number; right: number; top: number; bottom: number },
): RectTransformData {
  const offsetMin = { x: o.left, y: o.bottom }
  const offsetMax = { x: -o.right, y: -o.top }
  const sizeDelta = { x: offsetMax.x - offsetMin.x, y: offsetMax.y - offsetMin.y }
  const anchoredPosition = {
    x: offsetMin.x + sizeDelta.x * rt.pivot.x,
    y: offsetMin.y + sizeDelta.y * rt.pivot.y,
  }
  return { ...rt, sizeDelta: clean2(sizeDelta), anchoredPosition: clean2(anchoredPosition) }
}

// ---------- Ma trận 2D đầy đủ (gồm xoay, scale) ----------

/** Ma trận affine [a b c d e f]: x' = a*x + c*y + e, y' = b*x + d*y + f */
export type Mat = [number, number, number, number, number, number]
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function apply(m: Mat, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2]
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}

/** Ma trận đưa toạ độ cục bộ của node (gốc ở góc dưới trái rect của nó) sang toạ độ cục bộ của cha. */
export function localToParent(node: LayoutNode, local: Rect): Mat {
  const px = local.width * node.rect.pivot.x
  const py = local.height * node.rect.pivot.y
  const rad = (node.rect.rotation * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const sx = node.rect.scale.x, sy = node.rect.scale.y
  // T(pivot trên cha) · R · S · T(-pivot cục bộ)
  const t: Mat = [1, 0, 0, 1, local.x + px, local.y + py]
  const rs: Mat = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0]
  return mul(mul(t, rs), [1, 0, 0, 1, -px, -py])
}

/** Ma trận từ toạ độ cục bộ của từng node sang toạ độ canvas (gốc dưới trái). */
export function worldMatrices(tree: ResolvedNode, parent: Mat = IDENTITY, out = new Map<string, Mat>()): Map<string, Mat> {
  const m = mul(parent, localToParent(tree.node, tree.local))
  out.set(tree.node.id, m)
  for (const c of tree.children) worldMatrices(c, m, out)
  return out
}

/** 4 góc trên canvas theo thứ tự của Unity GetWorldCorners: dưới trái, trên trái, trên phải, dưới phải. */
export function cornersOf(m: Mat, local: Rect): Vec2[] {
  return [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: 0, y: local.height }),
    apply(m, { x: local.width, y: local.height }),
    apply(m, { x: local.width, y: 0 }),
  ]
}
