import type { CanvasSettings, DeviceProfile, ImageData, LayoutDocument, LayoutNode, NodeType, RectTransformData, TextData } from './types'
import { FORMAT_ID, FORMAT_VERSION } from './types'

/** Cấu hình mặc định lấy theo dự án MSO (UIRoot.prefab): 1080x1920, Expand. */
export const DEFAULT_CANVAS: CanvasSettings = {
  referenceResolution: { x: 1080, y: 1920 },
  screenMatchMode: 'Expand',
  match: 1,
  referencePixelsPerUnit: 100,
}

const none = { top: 0, bottom: 0, left: 0, right: 0 }

/** Safe area của iOS lấy theo điểm (pt) × hệ số màn hình. Android là số gần đúng. */
export const DEFAULT_DEVICES: DeviceProfile[] = [
  { id: '16x9', name: '16:9 (1080×1920)', width: 1080, height: 1920, safeInsets: none, enabled: true },
  { id: 'iphonex', name: 'iPhone X', width: 1125, height: 2436, safeInsets: { top: 132, bottom: 102, left: 0, right: 0 }, enabled: true },
  { id: 'ipad', name: 'iPad (4:3)', width: 1536, height: 2048, safeInsets: none, enabled: true },
  { id: 'android20x9', name: 'Android 20:9', width: 1080, height: 2400, safeInsets: { top: 96, bottom: 0, left: 0, right: 0 }, enabled: true },
  { id: 'iphone15pro', name: 'iPhone 15 Pro', width: 1179, height: 2556, safeInsets: { top: 177, bottom: 102, left: 0, right: 0 }, enabled: false },
  { id: 'ipadpro11', name: 'iPad Pro 11"', width: 1668, height: 2388, safeInsets: { top: 48, bottom: 40, left: 0, right: 0 }, enabled: false },
  { id: 'android21x9', name: 'Android 21:9', width: 1080, height: 2520, safeInsets: { top: 96, bottom: 0, left: 0, right: 0 }, enabled: false },
  { id: 'fold', name: 'Galaxy Fold (mở)', width: 1812, height: 2176, safeInsets: { top: 80, bottom: 0, left: 0, right: 0 }, enabled: false },
]

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function defaultRect(w = 200, h = 200): RectTransformData {
  return {
    anchorMin: { x: 0.5, y: 0.5 },
    anchorMax: { x: 0.5, y: 0.5 },
    pivot: { x: 0.5, y: 0.5 },
    anchoredPosition: { x: 0, y: 0 },
    sizeDelta: { x: w, y: h },
    rotation: 0,
    scale: { x: 1, y: 1 },
  }
}

export function stretchRect(): RectTransformData {
  return { ...defaultRect(0, 0), anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 } }
}

export function defaultImage(sprite: string | null = null): ImageData {
  return { sprite, color: { r: 1, g: 1, b: 1, a: 1 }, type: 'Simple', preserveAspect: false, raycastTarget: true }
}

export function defaultText(): TextData {
  return {
    content: 'Text',
    font: 'Kanit-SemiBold',
    fontSize: 48,
    color: { r: 1, g: 1, b: 1, a: 1 },
    bold: false,
    italic: false,
    hAlign: 'Center',
    vAlign: 'Middle',
    wrap: true,
    autoSize: false,
    fontSizeMin: 18,
    fontSizeMax: 72,
    lineSpacing: 0,
    characterSpacing: 0,
  }
}

export function createNode(type: NodeType, name?: string): LayoutNode {
  const node: LayoutNode = {
    id: newId(),
    name: name ?? type,
    type,
    active: true,
    rect: type === 'SafeArea' ? stretchRect() : type === 'Text' ? defaultRect(400, 100) : defaultRect(),
    children: [],
  }
  if (type === 'Image') node.image = defaultImage()
  if (type === 'Text') node.text = defaultText()
  return node
}

export function createDocument(name = 'NewScreen'): LayoutDocument {
  const root: LayoutNode = { id: 'root', name, type: 'Group', active: true, rect: stretchRect(), children: [] }
  const safe = createNode('SafeArea', 'SafeArea')
  root.children.push(safe)
  return { format: FORMAT_ID, version: FORMAT_VERSION, name, canvas: { ...DEFAULT_CANVAS }, sprites: [], root }
}
