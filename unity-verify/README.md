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

`fixture/` do web editor sinh (`src/model/fixture.ts`), không sửa tay.
