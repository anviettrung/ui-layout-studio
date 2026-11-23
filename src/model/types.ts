// Định dạng tài liệu layout. Mọi giá trị dùng đúng quy ước của Unity uGUI:
// trục Y hướng lên, đơn vị là đơn vị canvas (pixel của reference resolution),
// RectTransform mô tả bằng anchorMin/anchorMax/pivot/anchoredPosition/sizeDelta.
// Đặc tả đầy đủ: docs/FORMAT.md

export const FORMAT_ID = 'ui-layout-studio'
export const FORMAT_VERSION = 1

export interface Vec2 {
  x: number
  y: number
}

export interface RectTransformData {
  anchorMin: Vec2
  anchorMax: Vec2
  pivot: Vec2
  anchoredPosition: Vec2
  sizeDelta: Vec2
  /** Góc xoay quanh trục Z, độ, ngược chiều kim đồng hồ (như Unity). */
  rotation: number
  scale: Vec2
}

export type ScreenMatchMode = 'MatchWidthOrHeight' | 'Expand' | 'Shrink'

export interface CanvasSettings {
  referenceResolution: Vec2
  screenMatchMode: ScreenMatchMode
  /** 0 = theo chiều rộng, 1 = theo chiều cao. Chỉ dùng khi MatchWidthOrHeight. */
  match: number
  referencePixelsPerUnit: number
}

/** RGBA 0..1 */
export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export interface SpriteAsset {
  id: string
  /** Tên tệp trong thư mục sprites/ của gói export, kèm đuôi .png */
  file: string
  width: number
  height: number
  /** Viền 9-slice theo pixel ảnh, thứ tự như Unity: left, bottom, right, top */
  border: [number, number, number, number]
}

export type ImageType = 'Simple' | 'Sliced'

export interface ImageData {
  sprite: string | null
  color: Color
  type: ImageType
  preserveAspect: boolean
  raycastTarget: boolean
}

export type HAlign = 'Left' | 'Center' | 'Right'
export type VAlign = 'Top' | 'Middle' | 'Bottom'

export interface TextData {
  content: string
  /** Tên font logic, importer ánh xạ sang TMP_FontAsset. */
  font: string
  fontSize: number
  color: Color
  bold: boolean
  italic: boolean
  hAlign: HAlign
  vAlign: VAlign
  wrap: boolean
  autoSize: boolean
  fontSizeMin: number
  fontSizeMax: number
  lineSpacing: number
  characterSpacing: number
}

export type NodeType = 'Group' | 'Image' | 'Text' | 'SafeArea'

export interface LayoutNode {
  /** Id cố định, importer dùng để khớp lại node khi import lần sau. */
  id: string
  name: string
  type: NodeType
  /** false → GameObject bị SetActive(false) */
  active: boolean
  rect: RectTransformData
  image?: ImageData
  text?: TextData
  children: LayoutNode[]
  /** Chỉ dùng trong editor, không ảnh hưởng Unity. */
  editor?: { hidden?: boolean; locked?: boolean; collapsed?: boolean }
}

export interface LayoutDocument {
  format: typeof FORMAT_ID
  version: number
  name: string
  canvas: CanvasSettings
  sprites: SpriteAsset[]
  /** Node gốc tương ứng Canvas, luôn kéo giãn toàn màn. */
  root: LayoutNode
}

export interface DeviceProfile {
  id: string
  name: string
  /** Độ phân giải màn hình thật theo hướng dọc (portrait), pixel. */
  width: number
  height: number
  /** Khoảng lẹm của safe area, pixel màn hình, hướng dọc. */
  safeInsets: { top: number; bottom: number; left: number; right: number }
  enabled: boolean
}
