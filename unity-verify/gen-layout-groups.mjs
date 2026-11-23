// Sinh unity-verify/fixture/layout_groups.json: layout mẫu thứ hai, đủ HorizontalLayoutGroup, VerticalLayoutGroup,
// GridLayoutGroup, LayoutElement, ContentSizeFitter, Mask, RectMask2D, Image Filled. Chỉ dùng Image và Group
// (không Text: chữ đo khác nhau giữa trình duyệt và TMP).
// Chạy: node unity-verify/gen-layout-groups.mjs   (sau đó chạy run.ps1 -GenerateExpected để Unity sinh đáp án)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const v = (x, y) => ({ x, y })
const rect = (aMin, aMax, pivot, pos, size, rotation = 0, scale = [1, 1]) => ({
  anchorMin: v(...aMin), anchorMax: v(...aMax), pivot: v(...pivot),
  anchoredPosition: v(...pos), sizeDelta: v(...size), rotation, scale: v(...scale),
})
// Con của layout group: rect trong file chỉ là giá trị ban đầu (group tính lại), vẫn ghi đủ.
const childRect = (w, h, extra = {}) => rect(extra.aMin ?? [0.5, 0.5], extra.aMax ?? [0.5, 0.5], extra.pivot ?? [0.5, 0.5],
  extra.pos ?? [0, 0], [w, h], extra.rotation ?? 0, extra.scale ?? [1, 1])

const SPRITE = 'spr9' // 64x48, border l10 b12 r14 t16 (runner tự sinh PNG)
let colorSeed = 0
function color () {
  colorSeed++
  return { r: ((colorSeed * 37) % 100) / 100, g: ((colorSeed * 61) % 100) / 100, b: ((colorSeed * 83) % 100) / 100, a: 1 }
}

function node (id, type, r, extra = {}) {
  const n = { id, name: id, type, active: extra.active ?? true, rect: r }
  if (type === 'Image') {
    n.image = {
      sprite: extra.sprite ?? null, color: color(), type: extra.imageType ?? 'Simple',
      preserveAspect: false, raycastTarget: true, ...(extra.image ?? {}),
    }
  }
  for (const k of ['layoutGroup', 'layoutElement', 'contentSizeFitter', 'mask']) if (extra[k]) n[k] = extra[k]
  n.children = extra.children ?? []
  return n
}
const img = (id, r, extra) => node(id, 'Image', r, extra)
const grp = (id, r, extra) => node(id, 'Group', r, extra)
const hv = (type, o) => ({
  type,
  padding: { left: 0, right: 0, top: 0, bottom: 0, ...(o.padding ?? {}) },
  childAlignment: o.childAlignment ?? 'UpperLeft',
  spacing: o.spacing ?? 0,
  reverseArrangement: o.reverseArrangement ?? false,
  childControlWidth: o.childControlWidth ?? false, childControlHeight: o.childControlHeight ?? false,
  childScaleWidth: o.childScaleWidth ?? false, childScaleHeight: o.childScaleHeight ?? false,
  childForceExpandWidth: o.childForceExpandWidth ?? true, childForceExpandHeight: o.childForceExpandHeight ?? true,
})
const grid = (o) => ({
  type: 'Grid',
  padding: { left: 0, right: 0, top: 0, bottom: 0, ...(o.padding ?? {}) },
  childAlignment: o.childAlignment ?? 'UpperLeft',
  cellSize: v(...(o.cellSize ?? [100, 100])), gridSpacing: v(...(o.gridSpacing ?? [0, 0])),
  startCorner: o.startCorner ?? 'UpperLeft', startAxis: o.startAxis ?? 'Horizontal',
  constraint: o.constraint ?? 'Flexible', constraintCount: o.constraintCount ?? 2,
})
const le = (o) => ({
  ignoreLayout: false, minWidth: -1, minHeight: -1, preferredWidth: -1, preferredHeight: -1,
  flexibleWidth: -1, flexibleHeight: -1, layoutPriority: 1, ...o,
})
const cells = (prefix, count, w = 30, h = 30) => Array.from({ length: count }, (_, i) => img(`${prefix}${i + 1}`, childRect(w + i * 3, h + i * 2)))
const TOP = [0.5, 1]

const children = [
  // ---------------- Horizontal
  // hA: mặc định Unity (không điều khiển size, forceExpand cả hai), có con xoay, con scale (childScale tắt), con inactive.
  grp('hA', rect([0, 1], [1, 1], TOP, [0, -20], [-80, 140]), {
    layoutGroup: hv('Horizontal', { padding: { left: 10, right: 20, top: 5, bottom: 15 }, spacing: 12, childAlignment: 'MiddleCenter' }),
    children: [
      img('a1', childRect(100, 80)),
      img('a2', childRect(150, 60, { rotation: 10 })),
      grp('a3', childRect(50, 120, { pivot: [0, 0] })),
      img('a4', childRect(70, 70), { active: false }),
      img('a5', childRect(60, 40, { scale: [0.5, 2] })),
    ],
  }),
  // hB: điều khiển cả hai, reverse, LowerRight; preferred từ sprite Sliced/Simple/Filled, LayoutElement các kiểu, layoutPriority.
  grp('hB', rect([0, 1], [1, 1], TOP, [0, -180], [-40, 120]), {
    layoutGroup: hv('Horizontal', {
      padding: { left: 4, right: 4, top: 4, bottom: 4 }, spacing: 8, childAlignment: 'LowerRight', reverseArrangement: true,
      childControlWidth: true, childControlHeight: true, childForceExpandWidth: false, childForceExpandHeight: true,
    }),
    children: [
      img('b1', childRect(10, 10), { sprite: SPRITE, imageType: 'Sliced' }),
      img('b2', childRect(10, 10), { sprite: SPRITE }),
      img('b3', childRect(10, 10), { layoutElement: le({ minWidth: 30, preferredWidth: 120, flexibleWidth: 0 }) }),
      img('b4', childRect(10, 10), { layoutElement: le({ flexibleWidth: 2, preferredWidth: 40 }) }),
      grp('b5', rect([1, 0], [1, 0], [1, 0], [-5, 5], [33, 22]), { layoutElement: le({ ignoreLayout: true }) }),
      img('b6', childRect(10, 10), { layoutElement: le({ minWidth: 50, flexibleWidth: 1, minHeight: 20, preferredHeight: 200 }) }),
      img('b7', childRect(10, 10), { sprite: SPRITE, imageType: 'Filled', image: { fillMethod: 'Radial90', fillOrigin: 2, fillAmount: 0.4, fillClockwise: false } }),
      img('b8', childRect(10, 10), { sprite: SPRITE, imageType: 'Sliced', layoutElement: le({ preferredWidth: 10, layoutPriority: 0 }) }),
      img('b9', childRect(10, 10), { sprite: SPRITE, layoutElement: le({ preferredWidth: 10 }) }),
    ],
  }),
  // hC: chỉ điều khiển width, childScale cả hai, không forceExpand, UpperRight.
  grp('hC', rect([0, 1], [0, 1], [0, 1], [20, -320], [700, 150]), {
    layoutGroup: hv('Horizontal', {
      padding: { left: 0, right: 10, top: 8, bottom: 0 }, spacing: 6, childAlignment: 'UpperRight',
      childControlWidth: true, childScaleWidth: true, childScaleHeight: true, childForceExpandWidth: false, childForceExpandHeight: false,
    }),
    children: [
      img('c1', childRect(40, 60, { scale: [0.5, 1.5] }), { layoutElement: le({ preferredWidth: 100 }) }),
      img('c2', childRect(40, 30), { sprite: SPRITE }),
      grp('c3', childRect(40, 50)),
      img('c4', childRect(40, 70, { scale: [2, 0.5] }), { layoutElement: le({ preferredWidth: 80, flexibleWidth: 1 }) }),
    ],
  }),
  // hD: node Image có layout group; chỉ điều khiển height, spacing âm, LowerCenter.
  img('hD', rect([1, 1], [1, 1], [1, 1], [-20, -320], [300, 150]), {
    layoutGroup: hv('Horizontal', {
      padding: { left: 30, right: 0, top: 0, bottom: 10 }, spacing: -10, childAlignment: 'LowerCenter',
      childControlHeight: true, childForceExpandWidth: true, childForceExpandHeight: false,
    }),
    children: [
      img('d1', childRect(50, 10), { layoutElement: le({ preferredHeight: 60 }) }),
      img('d2', childRect(70, 10), { layoutElement: le({ minHeight: 90, preferredHeight: 40 }) }),
      img('d3', childRect(40, 10), { sprite: SPRITE, imageType: 'Sliced', layoutElement: le({ flexibleHeight: 1 }) }),
    ],
  }),
  // hE: chỉ có type (mọi trường khác lấy mặc định Unity), LayoutElement rỗng.
  grp('hE', rect([0, 1], [0, 1], [0, 1], [740, -320], [200, 60]), {
    layoutGroup: { type: 'Horizontal' },
    children: [
      img('e1', childRect(30, 20), { layoutElement: {} }),
      img('e2', childRect(40, 25)),
    ],
  }),

  // ---------------- Vertical
  // vA: điều khiển width, nested HorizontalLayoutGroup, con ignoreLayout.
  grp('vA', rect([0, 1], [0, 1], [0, 1], [20, -500], [320, 600]), {
    layoutGroup: hv('Vertical', {
      padding: { left: 12, right: 8, top: 20, bottom: 4 }, spacing: 10, childAlignment: 'UpperCenter',
      childControlWidth: true, childForceExpandWidth: true, childForceExpandHeight: false,
    }),
    children: [
      img('v1', childRect(10, 60)),
      img('v2', childRect(10, 100), { layoutElement: le({ preferredWidth: 100 }) }),
      grp('v3', childRect(10, 80), {
        layoutGroup: hv('Horizontal', { spacing: 4, childControlWidth: true, childControlHeight: true }),
        children: [
          img('v3a', childRect(10, 10), { layoutElement: le({ flexibleWidth: 1 }) }),
          img('v3b', childRect(10, 10), { layoutElement: le({ flexibleWidth: 2 }) }),
          img('v3c', childRect(10, 10), { layoutElement: le({ preferredWidth: 50 }) }),
        ],
      }),
      img('v4', rect([0, 0], [0, 0], [0, 0], [3, 7], [40, 40]), { layoutElement: le({ ignoreLayout: true }) }),
      img('v5', childRect(10, 50), { sprite: SPRITE, imageType: 'Sliced' }),
    ],
  }),
  // vB: kéo giãn theo chiều cao canvas; điều khiển height, reverse, LowerLeft, flexible.
  grp('vB', rect([0, 0], [0, 1], [0, 0], [20, 40], [320, -1140]), {
    layoutGroup: hv('Vertical', {
      padding: { left: 5, right: 5, top: 10, bottom: 10 }, spacing: 15, childAlignment: 'LowerLeft', reverseArrangement: true,
      childControlHeight: true, childForceExpandWidth: false, childForceExpandHeight: true,
    }),
    children: [
      img('w1', childRect(200, 10), { layoutElement: le({ minHeight: 50, preferredHeight: 100, flexibleHeight: 1 }) }),
      img('w2', childRect(150, 10), { layoutElement: le({ preferredHeight: 80, flexibleHeight: 3 }) }),
      img('w3', childRect(100, 10), { sprite: SPRITE, imageType: 'Sliced' }),
      grp('w4', childRect(90, 10), { layoutElement: le({ flexibleHeight: 0, minHeight: 120 }) }),
      img('w5', childRect(64, 10), { sprite: SPRITE, imageType: 'Filled', image: { fillMethod: 'Vertical', fillOrigin: 1, fillAmount: 0.6, fillClockwise: true } }),
    ],
  }),
  // vC: Vertical + ContentSizeFitter PreferredSize hai chiều, MiddleRight, node Image có RectMask2D.
  img('vC', rect([0.5, 1], [0.5, 1], [0.5, 1], [0, -500], [10, 10]), {
    layoutGroup: hv('Vertical', {
      padding: { left: 6, right: 6, top: 6, bottom: 6 }, spacing: 3, childAlignment: 'MiddleRight',
      childControlWidth: true, childControlHeight: true, childForceExpandWidth: false, childForceExpandHeight: false,
    }),
    contentSizeFitter: { horizontalFit: 'PreferredSize', verticalFit: 'PreferredSize' },
    mask: { type: 'RectMask2D' },
    children: [
      img('x1', childRect(10, 10), { layoutElement: le({ preferredWidth: 120, preferredHeight: 30 }) }),
      img('x2', childRect(10, 10), { layoutElement: le({ preferredWidth: 80, minHeight: 45 }) }),
      img('x3', childRect(10, 10), { sprite: SPRITE }),
    ],
  }),
  // vD: Vertical + ContentSizeFitter chỉ chiều dọc (MinSize), chiều ngang giữ sizeDelta; không điều khiển size con.
  grp('vD', rect([0.5, 1], [0.5, 1], [0.5, 1], [0, -800], [180, 10]), {
    layoutGroup: hv('Vertical', { padding: { top: 7, bottom: 9 }, spacing: 5, childAlignment: 'UpperRight', childForceExpandWidth: false }),
    contentSizeFitter: { horizontalFit: 'Unconstrained', verticalFit: 'MinSize' },
    children: [
      img('y1', childRect(60, 40), { layoutElement: le({ minHeight: 25 }) }),
      img('y2', childRect(90, 30)),
    ],
  }),

  // ---------------- Grid
  // gA: Flexible theo bề ngang canvas (cột đổi theo 1080/1440).
  grp('gA', rect([0.6, 1], [1, 1], [1, 1], [-20, -500], [-40, 300]), {
    layoutGroup: grid({ padding: { left: 8, right: 8, top: 8, bottom: 8 }, cellSize: [100, 80], gridSpacing: [10, 6] }),
    children: cells('ga', 7),
  }),
  // gB: FixedColumnCount 3, LowerRight, trục dọc, MiddleCenter.
  grp('gB', rect([0.6, 1], [1, 1], [1, 1], [-20, -820], [-40, 250]), {
    layoutGroup: grid({ padding: { left: 10, right: 0, top: 0, bottom: 20 }, childAlignment: 'MiddleCenter', cellSize: [60, 50], gridSpacing: [4, 8],
      startCorner: 'LowerRight', startAxis: 'Vertical', constraint: 'FixedColumnCount', constraintCount: 3 }),
    children: cells('gb', 8),
  }),
  // gC: FixedRowCount 2, UpperRight, trục ngang, LowerRight; neo đáy.
  grp('gC', rect([0.6, 0], [1, 0], [1, 0], [-20, 20], [-40, 150]), {
    layoutGroup: grid({ childAlignment: 'LowerRight', cellSize: [70, 40], gridSpacing: [5, 5],
      startCorner: 'UpperRight', constraint: 'FixedRowCount', constraintCount: 2 }),
    children: cells('gc', 5),
  }),
  // gD: Grid + ContentSizeFitter PreferredSize, FixedColumnCount 4, LowerLeft.
  grp('gD', rect([0.5, 0.5], [0.5, 0.5], [0, 1], [-60, -120], [10, 10]), {
    layoutGroup: grid({ padding: { left: 1, right: 2, top: 3, bottom: 4 }, childAlignment: 'LowerCenter', cellSize: [50, 50], gridSpacing: [2, 3],
      startCorner: 'LowerLeft', constraint: 'FixedColumnCount', constraintCount: 4 }),
    contentSizeFitter: { horizontalFit: 'PreferredSize', verticalFit: 'PreferredSize' },
    children: cells('gd', 6),
  }),
  // gE: Flexible trục dọc, kéo giãn theo chiều cao canvas, UpperRight, MiddleLeft.
  grp('gE', rect([0.6, 0], [1, 1], [1, 0], [-20, 190], [-40, -1290]), {
    layoutGroup: grid({ padding: { left: 3, right: 5, top: 7, bottom: 9 }, childAlignment: 'MiddleLeft', cellSize: [80, 60], gridSpacing: [6, 6],
      startCorner: 'UpperRight', startAxis: 'Vertical' }),
    children: cells('ge', 9),
  }),
  // gF: Grid chỉ có type (mặc định Unity: cell 100x100, Flexible), ít chỗ hơn một ô.
  grp('gF', rect([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [-200, -300], [150, 90]), {
    layoutGroup: { type: 'Grid' },
    children: cells('gf', 3),
  }),

  // ---------------- Mask, RectMask2D, Filled, ContentSizeFitter không có group
  img('mask1', rect([0.5, 0], [0.5, 0], [0.5, 0], [-100, 40], [150, 150]), {
    mask: { type: 'Mask', showMaskGraphic: false },
    children: [img('mask1c', rect([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [30, 30], [200, 120]))],
  }),
  img('mask2', rect([0.5, 0], [0.5, 0], [0.5, 0], [80, 40], [120, 150]), {
    sprite: SPRITE, imageType: 'Sliced', mask: { type: 'Mask' },
    children: [img('mask2c', rect([0, 0], [1, 1], [0.5, 0.5], [10, -10], [20, 20]))],
  }),
  grp('rmask', rect([0.5, 0], [0.5, 0], [0.5, 0], [-100, 220], [140, 100]), {
    mask: { type: 'RectMask2D' },
    children: [img('rmaskc', rect([0, 1], [0, 1], [0, 1], [-20, 20], [100, 100], 30))],
  }),
  img('fill1', rect([0.5, 0], [0.5, 0], [0.5, 0], [80, 220], [100, 100]), { sprite: SPRITE, imageType: 'Filled',
    image: { fillMethod: 'Radial360', fillOrigin: 2, fillAmount: 0.3, fillClockwise: false } }),
  img('fill2', rect([0.5, 0], [0.5, 0], [0.5, 0], [-100, 340], [160, 40]), { imageType: 'Filled',
    image: { fillMethod: 'Horizontal', fillOrigin: 1, fillAmount: 0.75, fillClockwise: true } }),
  img('fill3', rect([0.5, 0], [0.5, 0], [0.5, 0], [80, 340], [60, 100]), { sprite: SPRITE, imageType: 'Filled',
    image: { fillMethod: 'Radial180', fillOrigin: 3, fillAmount: 0.5 } }),
  img('fill4', rect([0.5, 0], [0.5, 0], [0.5, 0], [160, 340], [60, 60]), { imageType: 'Filled' }), // chỉ có type: mặc định Radial360, 0, 1, true
  // ContentSizeFitter trên Image không có group: kích thước theo preferred của sprite.
  img('fitA', rect([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [-150, 0], [10, 10]), { sprite: SPRITE, imageType: 'Sliced',
    contentSizeFitter: { horizontalFit: 'PreferredSize', verticalFit: 'PreferredSize' } }),
  img('fitB', rect([0.5, 0.5], [0.5, 0.5], [0, 1], [-100, 0], [10, 77]), { sprite: SPRITE,
    contentSizeFitter: { horizontalFit: 'PreferredSize', verticalFit: 'Unconstrained' } }),
  img('fitC', rect([0.5, 0.5], [0.5, 0.5], [1, 0], [-10, 20], [33, 44]), { sprite: SPRITE, imageType: 'Filled',
    contentSizeFitter: { horizontalFit: 'MinSize', verticalFit: 'PreferredSize' } }),
  grp('fitD', rect([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [-150, 100], [40, 40]), { contentSizeFitter: {} }),
  // LayoutElement trên node không nằm trong group: không có tác dụng hình học.
  img('loneLE', rect([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [-150, 200], [50, 30]), { layoutElement: le({ preferredWidth: 300, minHeight: 200 }) }),
]

const layout = {
  format: 'ui-layout-studio',
  version: 1,
  name: 'LayoutGroups',
  canvas: { referenceResolution: v(1080, 1920), screenMatchMode: 'Expand', match: 1, referencePixelsPerUnit: 100 },
  sprites: [{ id: SPRITE, file: 'slice9.png', width: 64, height: 48, border: [10, 12, 14, 16] }],
  root: grp('root', rect([0, 0], [1, 1], [0.5, 0.5], [0, 0], [0, 0]), { children }),
}
layout.root.name = 'LayoutGroups'

const out = join(dirname(fileURLToPath(import.meta.url)), 'fixture', 'layout_groups.json')
writeFileSync(out, JSON.stringify(layout, null, 2) + '\n')
console.log('Đã ghi ' + out)
