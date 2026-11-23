# Định dạng gói layout (v1)

Gói export là một tệp `.zip`:

```
<Tên màn>.uilayout.zip
├── layout.json
└── sprites/
    ├── btn_play.png
    └── ...
```

Cùng một tệp zip vừa là tệp dự án (artist mở lại để sửa tiếp) vừa là đầu vào của importer Unity.

## Nguyên tắc

- Mọi giá trị dùng **đúng quy ước Unity uGUI**: trục Y hướng lên, đơn vị là đơn vị canvas
  (pixel của reference resolution). Importer gán thẳng, không quy đổi.
- `RectTransform` mô tả đầy đủ bằng `anchorMin`, `anchorMax`, `pivot`, `anchoredPosition`, `sizeDelta`,
  `rotation` (độ, trục Z), `scale`.
- Thứ tự `children` là thứ tự sibling trong Unity: phần tử sau vẽ đè lên phần tử trước.

## layout.json

```jsonc
{
  "format": "ui-layout-studio",
  "version": 1,
  "name": "MainMenu",
  "canvas": {
    "referenceResolution": { "x": 1080, "y": 1920 },
    "screenMatchMode": "Expand",          // "MatchWidthOrHeight" | "Expand" | "Shrink"
    "match": 1,                           // 0..1, chỉ dùng khi MatchWidthOrHeight
    "referencePixelsPerUnit": 100
  },
  "sprites": [
    { "id": "k3j2...", "file": "btn_play.png", "width": 320, "height": 120,
      "border": [0, 0, 0, 0] }            // 9-slice: left, bottom, right, top (pixel ảnh)
  ],
  "root": { /* LayoutNode */ }
}
```

### LayoutNode

```jsonc
{
  "id": "a1b2c3",                 // cố định, importer dùng để khớp khi import lại
  "name": "BtnPlay",              // tên GameObject
  "type": "Image",                // "Group" | "Image" | "Text" | "SafeArea"
  "active": true,
  "rect": {
    "anchorMin": { "x": 0.5, "y": 0 }, "anchorMax": { "x": 0.5, "y": 0 },
    "pivot": { "x": 0.5, "y": 0.5 },
    "anchoredPosition": { "x": 0, "y": 240 },
    "sizeDelta": { "x": 320, "y": 120 },
    "rotation": 0,
    "scale": { "x": 1, "y": 1 }
  },
  "image": {                      // chỉ khi type = Image
    "sprite": "k3j2...",          // id trong sprites[], hoặc null (ô màu trơn)
    "color": { "r": 1, "g": 1, "b": 1, "a": 1 },
    "type": "Simple",             // "Simple" | "Sliced"
    "preserveAspect": false,
    "raycastTarget": true
  },
  "text": {                       // chỉ khi type = Text (TextMeshProUGUI)
    "content": "PLAY", "font": "Kanit-SemiBold", "fontSize": 48,
    "color": { "r": 1, "g": 1, "b": 1, "a": 1 },
    "bold": false, "italic": false,
    "hAlign": "Center",           // Left | Center | Right
    "vAlign": "Middle",           // Top | Middle | Bottom
    "wrap": true, "autoSize": false, "fontSizeMin": 18, "fontSizeMax": 72,
    "lineSpacing": 0, "characterSpacing": 0
  },
  "children": [],
  "editor": { "hidden": false, "locked": false }   // chỉ dùng trong editor, importer bỏ qua
}
```

- `root` là node ứng với Canvas: luôn kéo giãn toàn màn. Importer tạo prefab có gốc là node này
  (RectTransform kéo giãn), **không** tạo Canvas/CanvasScaler: prefab được đặt vào Canvas sẵn có của game.
- `SafeArea`: node kéo giãn toàn cha (anchor 0..1, offset 0) và được thu vào trong safe area của máy.
  Chỉ đặt trực tiếp dưới `root`. Importer gắn component safe area của dự án (mặc định
  `E7.NotchSolution.SafePadding`, đổi được trong cài đặt importer). Giá trị `rect` trong file của node này
  bị bỏ qua.
- `Group`: GameObject chỉ có RectTransform.
- `Image`: thêm `UnityEngine.UI.Image`. `Sliced` dùng `border` của sprite.
- `Text`: thêm `TMPro.TextMeshProUGUI`. `font` là tên logic, importer ánh xạ sang `TMP_FontAsset`
  qua bảng cài đặt; không tìm thấy thì dùng font mặc định của TMP và cảnh báo.

## Công thức (editor và Unity phải ra cùng kết quả)

CanvasScaler (Scale With Screen Size), màn `W×H`, reference `RW×RH`:

- `Expand`: `scale = min(W/RW, H/RH)`
- `Shrink`: `scale = max(W/RW, H/RH)`
- `MatchWidthOrHeight`: `scale = 2^lerp(log2(W/RW), log2(H/RH), match)`

Kích thước canvas = `(W/scale, H/scale)`.

RectTransform, cha kích thước `P`:

```
aMin = P * anchorMin;  aMax = P * anchorMax
size = (aMax - aMin) + sizeDelta
pivotPos = aMin + (aMax - aMin) * pivot + anchoredPosition
rect.min = pivotPos - size * pivot
```

## Tương thích

- `version` tăng khi có thay đổi phá tương thích. Importer từ chối tệp có `version` lớn hơn bản nó hiểu.
- Trường lạ thì bỏ qua (để bản editor mới hơn vẫn import được bằng importer cũ nếu không phá cấu trúc).

## Layout group, Mask, Filled (bổ sung v1, trường tuỳ chọn)

Các trường dưới đây đều tuỳ chọn. Thiếu thì coi như node không có component đó. Importer đời cũ bỏ qua chúng,
prefab vẫn đúng vị trí ở máy artist đang xem vì `rect` luôn lưu giá trị đã được layout tính.

```jsonc
"layoutGroup": {                  // HorizontalLayoutGroup / VerticalLayoutGroup / GridLayoutGroup
  "type": "Horizontal",           // "Horizontal" | "Vertical" | "Grid"
  "padding": { "left": 0, "right": 0, "top": 0, "bottom": 0 },
  "childAlignment": "UpperLeft",  // UpperLeft|UpperCenter|UpperRight|MiddleLeft|MiddleCenter|MiddleRight|LowerLeft|LowerCenter|LowerRight
  // Horizontal / Vertical
  "spacing": 0,
  "reverseArrangement": false,
  "childControlWidth": false, "childControlHeight": false,
  "childScaleWidth": false, "childScaleHeight": false,
  "childForceExpandWidth": true, "childForceExpandHeight": true,
  // Grid
  "cellSize": { "x": 100, "y": 100 },
  "gridSpacing": { "x": 0, "y": 0 },
  "startCorner": "UpperLeft",     // UpperLeft | UpperRight | LowerLeft | LowerRight
  "startAxis": "Horizontal",      // Horizontal | Vertical
  "constraint": "Flexible",       // Flexible | FixedColumnCount | FixedRowCount
  "constraintCount": 2
},
"layoutElement": {                // LayoutElement; -1 = không đặt (như Unity)
  "ignoreLayout": false,
  "minWidth": -1, "minHeight": -1, "preferredWidth": -1, "preferredHeight": -1,
  "flexibleWidth": -1, "flexibleHeight": -1, "layoutPriority": 1
},
"contentSizeFitter": {            // ContentSizeFitter
  "horizontalFit": "Unconstrained", // Unconstrained | MinSize | PreferredSize
  "verticalFit": "Unconstrained"
},
"mask": {                         // Mask (cắt theo hình sprite của Image cùng node) hoặc RectMask2D (cắt theo khung)
  "type": "Mask",                 // "Mask" | "RectMask2D"
  "showMaskGraphic": true         // chỉ dùng với Mask
}
```

Text thêm `"margin": { "left": 0, "top": 0, "right": 0, "bottom": 0 }` (TMP_Text.margin), tuỳ chọn.

Image thêm kiểu `"Filled"` với các trường:

```jsonc
"image": {
  "type": "Filled",
  "fillMethod": "Radial360",      // Horizontal | Vertical | Radial90 | Radial180 | Radial360
  "fillOrigin": 0,                // số nguyên như Image.fillOrigin của Unity
  "fillAmount": 1,                // 0..1
  "fillClockwise": true
}
```

Editor tính layout group theo đúng thuật toán của uGUI (LayoutRebuilder: tính kích thước mong muốn từ dưới lên,
đặt vị trí từ trên xuống, trục ngang trước rồi trục dọc). Phần bị layout group hoặc ContentSizeFitter điều khiển
được tính lại cho từng máy khi hiển thị, không ghi đè `rect` trong file; Unity cũng tự tính lại khi chạy, nên giá trị
lưu trong `rect` ở các trục bị điều khiển không ảnh hưởng kết quả.
