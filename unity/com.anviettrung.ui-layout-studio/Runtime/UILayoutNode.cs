using System.Collections.Generic;
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

        [Tooltip("Tên type đầy đủ của các component tuỳ chọn (layout group, LayoutElement, ContentSizeFitter, Mask, " +
                 "RectMask2D) do chính importer thêm. Chỉ những component này bị gỡ khi layout không còn trường tương ứng; " +
                 "component cùng loại do dev tự thêm luôn được giữ.")]
        public List<string> managedComponents = new List<string>();

        [Tooltip("Material importer gán cho TextMeshPro ở lần import gần nhất. Import lại chỉ đổi material của chữ khi " +
                 "layout có trường materialPreset/faceDilate/outline/underlay hoặc chữ vẫn đang dùng đúng material này; " +
                 "dev tự đổi material thì được giữ.")]
        public Material managedMaterial;
    }
}
