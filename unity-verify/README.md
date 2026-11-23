# unity-verify — kiểm chứng importer bằng Unity thật

Dựng một project Unity tạm, import layout mẫu bằng package `unity/com.anviettrung.ui-layout-studio` và so vị trí
thật trong Unity với kết quả công thức của web editor (`src/model/layout.ts`).

## Chạy

```powershell
powershell -ExecutionPolicy Bypass -File unity-verify\run.ps1
```

Lần đầu mất vài phút (Unity dựng `Library`), các lần sau khoảng 1–2 phút. Mã thoát 0 = PASS toàn bộ, khác 0 = có lỗi.
Báo cáo in ra màn hình và lưu ở `<project tạm>\VerifyData\report.txt`, log Unity ở `<project tạm>\Logs\uls-run.log`.

Tham số (đều có mặc định):

| Tham số | Mặc định |
|---|---|
| `-UnityPath` | `C:\Program Files\Unity\Hub\Editor\6000.3.10f1\Editor\Unity.exe` |
| `-ProjectPath` | `E:\Work\_tmp\uls-verify` (ngoài repo) |
| `-NotchSolutionPath` | biến môi trường `ULS_NOTCH_RUNTIME`: thư mục `NotchSolution/Runtime` trong một project có sẵn (chỉ đọc, chép sang project tạm). Trống thì dùng component giả lập |
| `-NoNotch` | bỏ NotchSolution, SafeArea kiểm bằng component giả lập |
| `-Clean` | xoá project tạm, dựng lại từ đầu |
| `-GenerateExpected` | để Unity ghi lại `fixture/layout_groups_expected.json` rồi kiểm như thường |

## Script làm gì

1. Tạo/cập nhật project tạm: `Packages/manifest.json` trỏ package qua `file:`, chép `Editor/` và `Runtime/` của thư
   mục này vào `Assets/ULSVerify/`, chép NotchSolution nếu có.
2. `ULSVerify.ULSVerifyRunner.Setup`: import TMP Essential Resources nếu project chưa có.
3. `ULSVerify.ULSVerifyRunner.Run` (`-ulsFixture unity-verify/fixture`):
   - **1.** Đóng `fixture/layout.json` thành zip, import ra prefab, kiểm cấu trúc, component, thứ tự sibling.
   - **2a.** Với từng case trong `fixture/expected.json` (8 máy × 4 chế độ scaler): RectTransform gốc kích thước
     `canvasSize`, pivot/anchor (0,0) ở gốc toạ độ, scale 1; instantiate prefab; đặt offset node SafeArea theo `safe`;
     `Canvas.ForceUpdateCanvases()`; so `GetWorldCorners` của từng node với expected, sai số cho phép 0.01.
   - **2b.** Như 2a nhưng SafeArea do `SafePadding` thật của NotchSolution tự tính (gốc là Canvas world space kích thước
     `canvasSize`, safe area tương đối truyền qua `INotchSimulatorTarget.SimulatorUpdate` như Notch Simulator).
   - **3.** CanvasScaler: (a) bản chép nguyên văn `CanvasScaler.HandleScaleWithScreenSize` (float, `Mathf`) so với
     `scale` trong expected.json; (b) `CanvasScaler` thật ở độ phân giải batchmode (640×480), 5 chế độ, so
     `Canvas.scaleFactor` với công thức JS.
   - **4.** Import lại: dev thêm GameObject/component vào prefab, artist dời node, xoá node có con của dev, thêm node,
     đổi thứ tự; kiểm mọi thứ của dev được giữ, con của node bị xoá được chuyển lên cha, import lần 3 không đổi gì.
   - **5.** Sprite PNG tự sinh có 9-slice `[10,12,14,16]`: kiểm `spriteBorder`, `Image.type = Sliced`, cài đặt texture;
     thuộc tính TextMeshPro; bảng ánh xạ font.
   - **6.** Từ chối `version` lớn hơn và `format` khác.
   - **7.** Import `fixture/layout_groups.json` (sprite `slice9.png` 64×48, 9-slice `[10,12,14,16]`, runner tự sinh): mọi node
     có đúng loại component theo file (layout group, LayoutElement, ContentSizeFitter, Mask/RectMask2D, Image Filled) và
     từng giá trị khớp file, kể cả mặc định khi thiếu trường; `UILayoutNode.managedComponents`; prefab giữ `rect` trong file.
   - **8.** Hình học layout group: dựng prefab trong Canvas world space ở 4 kích thước canvas
     `1080×1920, 1080×2339, 1440×1920, 1080×2400`, `LayoutRebuilder.ForceRebuildLayoutImmediate` cho từng layout root
     (root nông trước, như `CanvasUpdateRegistry`) + `Canvas.ForceUpdateCanvases`, lặp tới khi ổn định (hiện ổn định ngay
     lượt 1), so 4 góc mọi node với `fixture/layout_groups_expected.json`, sai số 0.01.
   - **9.** Import lại: file bỏ/đổi layoutGroup, layoutElement, mask, contentSizeFitter → chỉ gỡ/thay component importer đã
     thêm; LayoutElement, layout group, RectMask2D dev tự thêm được giữ; component dev có sẵn được dùng lại khi file thêm
     trường cùng loại; Mask trên node không có Image thì cảnh báo.
   - **10.** Material TextMeshPro (`text.materialPreset`, `faceDilate`, `outline`, `underlay`; layout dựng trong
     `ULSVerifyTextMaterial.cs`, font mặc định TMP và một bản chép đổi sang shader Mobile SDF): (a) preset có sẵn được
     gán, kể cả khi có material trùng tên dùng atlas khác (chọn bản đúng atlas) và preset là sub-asset của font asset;
     (b) preset không tồn tại + thông số → cảnh báo, tạo preset mới trong `Assets/UI/_TMPMaterials`; (c) nhiều chữ cùng
     font + thông số dùng chung một asset; (d) chỉ thông số không preset, font khác ra preset riêng; kiểm từng property
     (`_FaceDilate`, `_OutlineWidth/Color`, `_Underlay*`) và keyword `OUTLINE_ON`/`UNDERLAY_ON`; (e) import lần hai không
     tạo asset mới, GUID giữ nguyên; (f) dev đổi material trên chữ không có trường material → giữ, trên chữ có preset →
     gán lại theo file; file bỏ trường trên chữ importer quản lý → về material mặc định của font.

`fixture/layout.json` và `fixture/expected.json` do web editor sinh (`src/model/fixture.ts`), không sửa tay.

### Layout mẫu thứ hai: layout group (đáp án do Unity sinh)

- `fixture/layout_groups.json` sinh bằng `node unity-verify/gen-layout-groups.mjs` (110 node, chỉ Image và Group, không
  Text vì chữ đo khác nhau giữa trình duyệt và TMP). Đủ Horizontal/Vertical/Grid với nhiều tổ hợp childControl,
  forceExpand, childScale, childAlignment, padding, spacing (cả âm), reverse, layout group lồng nhau; Grid các constraint,
  startCorner, startAxis; LayoutElement min/preferred/flexible/ignoreLayout/layoutPriority; ContentSizeFitter; Mask,
  RectMask2D; Image Filled; preferred size từ sprite Simple/Sliced/Filled.
- `fixture/layout_groups_expected.json` là **đáp án do Unity tính**, dùng để kiểm phần tính layout group của web editor.
  Dạng `[{ "canvasSize": {x,y}, "nodes": { id: [[x,y] BL, TL, TR, BR] } }]`: 4 góc `GetWorldCorners`, đơn vị canvas,
  gốc dưới trái của canvas. Node inactive vẫn có mặt (layout group bỏ qua nó, giữ `rect` trong file).
- Sinh lại sau khi đổi layout mẫu:

  ```powershell
  node unity-verify/gen-layout-groups.mjs
  powershell -ExecutionPolicy Bypass -File unity-verify\run.ps1 -GenerateExpected
  ```
