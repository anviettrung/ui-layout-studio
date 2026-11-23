using System;
using System.Collections.Generic;
using System.IO;
using TMPro;
using UnityEditor;
using UnityEngine;

namespace UILayoutStudio.EditorTools
{
    /// <summary>
    /// Cài đặt importer dùng chung cho cả project (một asset duy nhất, commit cùng project):
    /// bảng ánh xạ font, type component safe area, mẫu đường dẫn mặc định.
    /// </summary>
    public sealed class UILayoutStudioSettings : ScriptableObject
    {
        public const string DefaultAssetPath = "Assets/Editor/UILayoutStudioSettings.asset";
        public const string DefaultSafeAreaType = "E7.NotchSolution.SafePadding";

        [Serializable]
        public sealed class FontMapping
        {
            [Tooltip("Tên font logic trong layout.json, vd Kanit-SemiBold")]
            public string logicalName;
            public TMP_FontAsset font;
        }

        [Tooltip("Ánh xạ tên font logic (trường text.font) sang TMP_FontAsset.")]
        public List<FontMapping> fonts = new List<FontMapping>();

        [Tooltip("Tên đầy đủ của type component gắn vào node SafeArea (tìm qua mọi assembly).")]
        public string safeAreaComponentType = DefaultSafeAreaType;

        [Tooltip("Thư mục sprite mặc định. {name} = tên layout.")]
        public string spriteFolderTemplate = "Assets/UI/{name}/Sprites";

        [Tooltip("Đường dẫn prefab mặc định. {name} = tên layout.")]
        public string prefabPathTemplate = "Assets/UI/{name}/{name}.prefab";

        [Tooltip("Không có ánh xạ thì thử tìm TMP_FontAsset tên '<font>' hoặc '<font> SDF' trong project.")]
        public bool autoFindFontByName = true;

        public static UILayoutStudioSettings Find()
        {
            var guids = AssetDatabase.FindAssets("t:" + nameof(UILayoutStudioSettings));
            foreach (var g in guids)
            {
                var s = AssetDatabase.LoadAssetAtPath<UILayoutStudioSettings>(AssetDatabase.GUIDToAssetPath(g));
                if (s != null) return s;
            }
            return null;
        }

        /// <summary>Lấy asset cài đặt; chưa có thì tạo ở <see cref="DefaultAssetPath"/>.</summary>
        public static UILayoutStudioSettings GetOrCreate()
        {
            var s = Find();
            if (s != null) return s;
            s = CreateInstance<UILayoutStudioSettings>();
            var dir = Path.GetDirectoryName(DefaultAssetPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            AssetDatabase.CreateAsset(s, DefaultAssetPath);
            AssetDatabase.SaveAssets();
            return s;
        }

        /// <summary>Cài đặt tạm trong bộ nhớ khi project chưa có asset (không tạo tệp).</summary>
        public static UILayoutStudioSettings FindOrDefault()
        {
            var s = Find();
            return s != null ? s : CreateInstance<UILayoutStudioSettings>();
        }

        public static string Expand(string template, string layoutName) =>
            (template ?? "").Replace("{name}", SanitizeFileName(layoutName));

        public static string SanitizeFileName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "Layout";
            foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            return name.Trim();
        }
    }
}
