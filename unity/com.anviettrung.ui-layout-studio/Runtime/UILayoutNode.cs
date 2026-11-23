using UnityEngine;

namespace UILayoutStudio
{
    /// <summary>
    /// Đánh dấu GameObject được importer UI Layout Studio tạo ra. <see cref="nodeId"/> là id cố định
    /// của node trong layout.json, dùng để khớp lại khi import lại. GameObject không có component này
    /// được coi là do dev tự thêm và luôn được giữ nguyên.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("UI Layout Studio/UI Layout Node")]
    public sealed class UILayoutNode : MonoBehaviour
    {
        [Tooltip("Id của node trong layout.json. Đừng sửa tay.")]
        public string nodeId;

        [Tooltip("Loại node ở lần import gần nhất (Group, Image, Text, SafeArea).")]
        public string nodeType;
    }
}
