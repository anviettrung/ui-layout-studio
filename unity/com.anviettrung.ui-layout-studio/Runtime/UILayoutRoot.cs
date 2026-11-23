using UnityEngine;

namespace UILayoutStudio
{
    /// <summary>
    /// Nằm trên gốc prefab do UI Layout Studio tạo: nhớ tệp zip nguồn và cài đặt import
    /// để import lại bằng một cú bấm.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("UI Layout Studio/UI Layout Root")]
    public sealed class UILayoutRoot : MonoBehaviour
    {
        [Tooltip("Đường dẫn tệp .zip nguồn. Tương đối với thư mục project nếu tệp nằm trong project, không thì tuyệt đối.")]
        public string sourceZipPath;

        [Tooltip("Thư mục chứa sprite trong project, vd Assets/UI/MainMenu/Sprites.")]
        public string spriteFolder;

        [Tooltip("Tên type component safe area gắn vào node SafeArea. Để trống thì dùng cài đặt chung của project.")]
        public string safeAreaComponentType;

        [Tooltip("Tên layout (trường name trong layout.json) ở lần import gần nhất.")]
        public string layoutName;

        [Tooltip("Thời điểm import gần nhất (ISO 8601, giờ máy).")]
        public string lastImportTime;
    }
}
