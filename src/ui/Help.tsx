export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help">
        <header>
          <h2>Hướng dẫn nhanh</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </header>
        <h3>Quy trình</h3>
        <ol>
          <li>Kéo thả các PNG đã cắt vào tab <b>Assets</b> (hoặc thẳng vào khung nhìn).</li>
          <li>Kéo sprite từ Assets vào khung nhìn. Sprite vào đúng kích thước gốc (Native Size).</li>
          <li>
            Đặt <b>anchor</b> cho từng phần tử (nút ô vuông trong Inspector): thứ bám góc trên thì neo góc trên, thanh ngang thì kéo giãn ngang… Đây là
            điều quyết định UI đứng đúng chỗ trên máy khác.
          </li>
          <li>
            Bấm <b>Mọi máy</b> (phím G) để xem cùng lúc trên 16:9, iPhone X, iPad… Chỗ nào lệch thì sửa anchor rồi xem lại.
          </li>
          <li>
            <b>Xuất zip</b> (Ctrl+S), gửi cho dev. Dev import vào Unity là ra prefab đúng y như vậy. Tệp zip này cũng là tệp để mở lại sửa tiếp.
          </li>
        </ol>
        <h3>Mẹo</h3>
        <ul>
          <li>Đặt phần tử trong <b>SafeArea</b> để tránh tai thỏ và thanh home. Hình nền thì đặt ngoài SafeArea, kéo giãn toàn màn.</li>
          <li>Thả lại PNG trùng tên để thay ảnh: mọi chỗ dùng ảnh đó tự cập nhật.</li>
          <li>Ảnh có góc bo cần co giãn (khung, nút dài): bấm sprite trong Assets, đặt viền 9-slice, rồi để Image Type = Sliced.</li>
          <li>
            <b>Ảnh mẫu…</b>: phủ ảnh demo cũ từ Photoshop lên để xếp theo cho nhanh.
          </li>
          <li>Kéo nhãn của ô số (vd "Pos X") sang trái/phải để chỉnh. Ô số nhận phép tính: 1080/2.</li>
          <li>Group (nhóm) không bấm chọn được trên khung nhìn, chọn trong Hierarchy rồi kéo khung chọn.</li>
          <li>Bản làm dở tự lưu trong trình duyệt, nhưng hãy Xuất zip để giữ chắc chắn.</li>
        </ul>
        <h3>Phím tắt</h3>
        <table className="keys">
          <tbody>
            <tr><td>Ctrl+Z / Ctrl+Y</td><td>Hoàn tác / làm lại</td></tr>
            <tr><td>Ctrl+D</td><td>Nhân bản</td></tr>
            <tr><td>Delete</td><td>Xoá</td></tr>
            <tr><td>Mũi tên (Shift)</td><td>Dời 1 (10) đơn vị</td></tr>
            <tr><td>Shift khi kéo</td><td>Khoá trục khi di chuyển, giữ tỉ lệ khi resize góc</td></tr>
            <tr><td>Alt khi kéo</td><td>Tạm tắt snap</td></tr>
            <tr><td>Space + kéo / chuột giữa</td><td>Cuộn khung nhìn</td></tr>
            <tr><td>Ctrl + lăn chuột</td><td>Phóng to / thu nhỏ</td></tr>
            <tr><td>F / G</td><td>Vừa khung / bật tắt xem mọi máy</td></tr>
            <tr><td>Ctrl+S</td><td>Xuất zip</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
