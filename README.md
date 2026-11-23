# UI Layout Studio

Công cụ để artist tự xếp UI game trên trình duyệt rồi giao cho dev, Unity dựng lại **đúng 100%**.

**Dùng ngay:** https://anviettrung.github.io/ui-layout-studio/

## Vấn đề nó giải quyết

Quy trình cũ: artist xếp trên Photoshop, xuất ảnh demo và từng asset lẻ, dev nhìn ảnh rồi ghép lại trong Unity.

- Dev ghép bằng mắt nên hay lệch.
- Photoshop chỉ có toạ độ tuyệt đối trên một khung cố định, còn Unity dùng anchor, pivot và Canvas Scaler.
  Artist không khai báo được "nút này bám góc trên phải", dev phải đoán.
- Artist không thấy UI hiển thị ra sao trên iPhone X, iPad, máy 20:9…

Quy trình mới:

1. Artist kéo PNG vào web, xếp UI bằng đúng mô hình RectTransform của Unity (anchor, pivot…),
   xem cùng lúc trên nhiều tỉ lệ màn hình có safe area.
2. Xuất một tệp `.uilayout.zip` (layout + sprite).
3. Dev import zip trong Unity, ra prefab uGUI dựng sẵn. Dev không phải xếp lại bằng tay.
   Import lại khi artist sửa thì chỉ cập nhật vị trí và ảnh, giữ nguyên script và object dev đã gắn.

## Vì sao khớp 100%

- Editor tính vị trí bằng đúng công thức của Unity (`RectTransform`, `CanvasScaler`), xem `src/model/layout.ts`.
- File xuất lưu đúng các giá trị RectTransform, importer gán thẳng vào, không quy đổi.
- Có bộ kiểm chứng chạy bằng Unity thật (`unity-verify/`): so góc của mọi node trên 8 máy × 4 chế độ scaler
  giữa editor và Unity.
- Chữ là phần duy nhất chỉ xem gần đúng: TextMeshPro và trình duyệt dựng chữ khác nhau.
  Khung chữ, cỡ chữ và căn lề thì vẫn khớp.

## Cho artist

Mở link trên, bấm **?** ở góc phải để xem hướng dẫn và phím tắt. Tóm tắt:

- Kéo PNG vào tab Assets, kéo sprite vào khung nhìn.
- Đặt anchor bằng nút ô vuông trong Inspector. Thứ bám góc thì neo góc, thanh ngang thì kéo giãn ngang.
- Phần tử cần né tai thỏ đặt trong `SafeArea`. Hình nền đặt ngoài, kéo giãn toàn màn.
- Bấm **Mọi máy** (phím G) để soát trên mọi tỉ lệ.
- **Xuất zip** (Ctrl+S) gửi dev. Tệp này cũng dùng để mở lại sửa tiếp.

## Cho dev (Unity)

Cài package qua Package Manager → *Add package from git URL*:

```
https://github.com/anviettrung/ui-layout-studio.git?path=/unity/com.anviettrung.ui-layout-studio
```

Hướng dẫn import: [`unity/com.anviettrung.ui-layout-studio/README.md`](unity/com.anviettrung.ui-layout-studio/README.md).
Định dạng tệp: [`docs/FORMAT.md`](docs/FORMAT.md).

## Phát triển

```
npm install
npm run dev        # chạy cục bộ
npm test           # test phần lõi tính layout
npm run fixture    # sinh lại unity-verify/fixture từ layout mẫu
npm run build && npm run e2e -- <thư mục PNG mẫu> <thư mục kết quả>   # chạy thử trên Chrome thật
```

Mỗi lần push lên `main`, GitHub Actions test, build và deploy lên GitHub Pages.

### Cấu trúc

- `src/model/`: định dạng dữ liệu và lõi tính layout (không phụ thuộc React).
- `src/render/`: khung nhìn, vẽ node, chọn, kéo, snap.
- `src/ui/`: Hierarchy, Inspector, Assets, Cài đặt.
- `unity/`: package Unity (importer).
- `unity-verify/`: kiểm chứng editor và Unity ra cùng kết quả.

### Hướng phát triển

- Nhập thẳng tệp PSD: đọc layer, tự cắt PNG, giữ vị trí.
- Chọn nhiều node cùng lúc, căn hàng và chia đều.
- Xuất ảnh xem trước cho từng máy.
