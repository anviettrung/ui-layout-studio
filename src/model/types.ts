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

export type ImageType = 'Simple' | 'Sliced' | 'Filled'
export type FillMethod = 'Horizontal' | 'Vertical' | 'Radial90' | 'Radial180' | 'Radial360'

export interface ImageData {
  sprite: string | null
  color: Color
  type: ImageType
  preserveAspect: boolean
  raycastTarget: boolean
  fillMethod?: FillMethod
  fillOrigin?: number
  fillAmount?: number
  fillClockwise?: boolean
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
  /** TMP_Text.margin */
  margin?: { left: number; top: number; right: number; bottom: number }
}

export type TextAnchor =
  | 'UpperLeft' | 'UpperCenter' | 'UpperRight'
  | 'MiddleLeft' | 'MiddleCenter' | 'MiddleRight'
  | 'LowerLeft' | 'LowerCenter' | 'LowerRight'

export interface LayoutGroupData {
  type: 'Horizontal' | 'Vertical' | 'Grid'
  padding: { left: number; right: number; top: number; bottom: number }
  childAlignment: TextAnchor
  spacing: number
  reverseArrangement: boolean
  childControlWidth: boolean
  childControlHeight: boolean
  childScaleWidth: boolean
  childScaleHeight: boolean
  childForceExpandWidth: boolean
  childForceExpandHeight: boolean
  cellSize: Vec2
  gridSpacing: Vec2
  startCorner: 'UpperLeft' | 'UpperRight' | 'LowerLeft' | 'LowerRight'
  startAxis: 'Horizontal' | 'Vertical'
  constraint: 'Flexible' | 'FixedColumnCount' | 'FixedRowCount'
  constraintCount: number
}

export interface LayoutElementData {
  ignoreLayout: boolean
  minWidth: number
  minHeight: number
  preferredWidth: number
  preferredHeight: number
  flexibleWidth: number
  flexibleHeight: number
  layoutPriority: number
}

export type FitMode = 'Unconstrained' | 'MinSize' | 'PreferredSize'

export interface MaskData {
  type: 'Mask' | 'RectMask2D'
  showMaskGraphic: boolean
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
  layoutGroup?: LayoutGroupData
  layoutElement?: LayoutElementData
  contentSizeFitter?: { horizontalFit: FitMode; verticalFit: FitMode }
  mask?: MaskData
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
