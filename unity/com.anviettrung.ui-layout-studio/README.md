# UI Layout Studio Importer (Unity)

Import gói layout xuất từ web editor **UI Layout Studio** (`<Tên>.uilayout.zip` gồm `layout.json` + `sprites/*.png`)
thành prefab uGUI + TextMeshPro, khớp đúng vị trí artist đã xếp. Đặc tả định dạng: `docs/FORMAT.md` trong repo.

- Unity 6 (6000.0 trở lên), phụ thuộc `com.unity.ugui` 2.0.0 (đã gồm TextMeshPro).
- Không phụ thuộc NotchSolution lúc biên dịch: component safe area được tìm bằng reflection theo tên type.

## Cài đặt

Package Manager → `+` → *Add package from git URL…*:

```
https://github.com/anviettrung/ui-layout-studio.git?path=/unity/com.anviettrung.ui-layout-studio
```

hoặc thêm vào `Packages/manifest.json`:

```json
"com.anviettrung.ui-layout-studio": "https://github.com/anviettrung/ui-layout-studio.git?path=/unity/com.anviettrung.ui-layout-studio"
```

Ghim phiên bản bằng `#<tag hoặc commit>` ở cuối URL.

## Import

1. **Tools > UI Layout Studio > Import**.
2. Chọn tệp `.zip`. Thư mục sprite (mặc định `Assets/UI/<tên>/Sprites`) và đường dẫn prefab
   (mặc định `Assets/UI/<tên>/<tên>.prefab`) tự điền theo tên layout, sửa được.
3. Bấm **Import**. Prefab có gốc là node `root` (kéo giãn toàn cha). Kéo prefab vào Canvas sẵn có của game;
   importer **không** tạo Canvas/CanvasScaler.

### Cài đặt project (dùng chung, nên commit)

Trong cửa sổ Import bấm **Tạo Assets/Editor/UILayoutStudioSettings.asset** (đặt chỗ khác cũng được, importer
tìm theo type):

| Mục | Ý nghĩa |
|---|---|
| Ánh xạ font | Tên font logic trong layout (vd `Kanit-SemiBold`) → `TMP_FontAsset`. Nút "Thêm dòng ánh xạ" điền sẵn các font layout đang dùng. |
| Tự tìm font theo tên | Chưa ánh xạ thì tìm `TMP_FontAsset` tên `<font>` hoặc `<font> SDF` (vd `Kanit-SemiBold SDF`). Không thấy thì dùng font mặc định TMP và cảnh báo. |
| Component safe area | Mặc định `E7.NotchSolution.SafePadding`. Không tìm thấy type thì cảnh báo, node SafeArea vẫn được tạo (kéo giãn toàn cha). |
| Mẫu thư mục sprite / prefab | `{name}` = tên layout. |

Chưa có asset cài đặt thì importer dùng giá trị mặc định ở bảng trên.

## Import lại

Prefab tạo ra có component `UILayoutRoot` trên gốc, nhớ tệp zip nguồn (tương đối với project nếu nằm trong project),
thư mục sprite và type safe area. Import lại bằng một trong các cách:

- Chọn prefab trong Project → nút **Re-import** trong Inspector của `UILayoutRoot`, hoặc trong cửa sổ Import.
- Chuột phải prefab → **UI Layout Studio > Re-import** (chọn nhiều prefab được).
- Menu ⋮ của component `UILayoutRoot` → **Re-import** (cả khi đang mở prefab).
- Tệp zip đã dời chỗ thì importer hỏi chọn lại.

Quy tắc khi import lại (khớp node theo `UILayoutNode.nodeId`):

- Node có trong file: chỉ ghi đè các giá trị có trong `layout.json` (RectTransform, tên, active, thuộc tính Image/TMP
  trong định dạng, thứ tự sibling). Thuộc tính khác (material, `pixelsPerUnitMultiplier`, raycast padding…) giữ nguyên.
- Node mới: tạo mới.
- Node bị xoá khỏi file: xoá GameObject. GameObject dev tự thêm bên dưới (không có `UILayoutNode`) được chuyển lên cha
  gần nhất còn tồn tại, giữ vị trí world, kèm cảnh báo trong Console.
- GameObject và component dev tự thêm luôn giữ nguyên. Thứ tự sibling: node của layout xếp lại theo file, GameObject
  của dev giữ đúng vị trí (slot) cũ.
- Đừng xoá hay sửa `UILayoutNode` trên node do importer tạo: mất nó thì lần sau node đó bị coi là của dev và một node
  mới được tạo ra.

## Ánh xạ dữ liệu

| layout.json | Unity |
|---|---|
| `rect.anchorMin/anchorMax/pivot/anchoredPosition/sizeDelta` | gán thẳng vào `RectTransform` |
| `rect.rotation` | `localEulerAngles.z` |
| `rect.scale` | `localScale = (x, y, 1)` |
| `Group` | chỉ `RectTransform` |
| `Image` | `Image`: sprite (null = ô màu), color, type Simple/Sliced, preserveAspect, raycastTarget |
| `Text` | `TextMeshProUGUI`: text, font (qua bảng ánh xạ), fontSize, color, Bold/Italic, `horizontalAlignment` + `verticalAlignment`, `textWrappingMode` (Normal/NoWrap), autoSize + min/max, lineSpacing, characterSpacing |
| `SafeArea` | kéo giãn 0..1, offset 0 + component safe area |
| `active` | `SetActive` |
| thứ tự `children` | thứ tự sibling |
| `sprites[].border` [l,b,r,t] | `TextureImporter.spriteBorder = Vector4(l,b,r,t)` |

Sprite được chép vào thư mục sprite và đặt: Texture Type Sprite, Single, pivot giữa, Mesh Type Full Rect, mipmap tắt,
Alpha Is Transparency, Pixels Per Unit = `canvas.referencePixelsPerUnit` (để viền 9-slice đúng kích thước như trên web),
nén để mặc định của project. Tệp không đổi nội dung thì không import lại.

## Dùng từ code

```csharp
using UILayoutStudio.EditorTools;

var r = UILayoutImporter.Import(new ImportOptions {
    zipPath = "Design/MainMenu.uilayout.zip",
    prefabPath = "Assets/UI/MainMenu/MainMenu.prefab",   // trống = theo mẫu trong cài đặt
});
Debug.Log(r); // số node tạo/cập nhật/xoá, cảnh báo trong r.warnings
UILayoutImporter.Reimport(prefabAsset);
```

## Kiểm chứng

`unity-verify/` trong repo dựng project Unity tạm, import layout mẫu và so 4 góc từng node với kết quả công thức của
web editor trên 8 máy × 4 chế độ CanvasScaler. Xem `unity-verify/README.md`.
