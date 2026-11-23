using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UILayoutStudio.EditorTools
{
    /// <summary>Cửa sổ Tools > UI Layout Studio > Import.</summary>
    public sealed class UILayoutImportWindow : EditorWindow
    {
        private const string PrefKey = "UILayoutStudio.ImportWindow.";

        [SerializeField] private string zipPath = "";
        [SerializeField] private string spriteFolder = "";
        [SerializeField] private string prefabPath = "";
        [SerializeField] private bool spriteFolderEdited, prefabPathEdited;

        private UILayoutStudioSettings settings;
        private SerializedObject settingsSO;
        private LayoutDocument preview;
        private string previewError;
        private Vector2 scroll;

        [MenuItem("Tools/UI Layout Studio/Import", priority = 0)]
        public static void Open()
        {
            var w = GetWindow<UILayoutImportWindow>("UI Layout Studio");
            w.minSize = new Vector2(420, 360);
            w.Show();
        }

        private void OnEnable()
        {
            if (string.IsNullOrEmpty(zipPath)) zipPath = EditorPrefs.GetString(PrefKey + "zip", "");
            settings = UILayoutStudioSettings.Find();
            settingsSO = settings != null ? new SerializedObject(settings) : null;
            LoadPreview();
        }

        private void OnSelectionChange() => Repaint();

        private void LoadPreview()
        {
            preview = null;
            previewError = null;
            if (string.IsNullOrEmpty(zipPath)) return;
            try
            {
                if (!File.Exists(UILayoutImporter.ToFullPath(zipPath))) { previewError = "Không thấy tệp."; return; }
                preview = UILayoutImporter.ReadDocument(zipPath);
                var s = settings != null ? settings : UILayoutStudioSettings.FindOrDefault();
                if (!spriteFolderEdited) spriteFolder = UILayoutStudioSettings.Expand(s.spriteFolderTemplate, preview.name);
                if (!prefabPathEdited) prefabPath = UILayoutStudioSettings.Expand(s.prefabPathTemplate, preview.name);
            }
            catch (Exception e) { previewError = e.Message; }
        }

        private void OnGUI()
        {
            scroll = EditorGUILayout.BeginScrollView(scroll);
            DrawReimportSelection();

            EditorGUILayout.LabelField("Import mới / ghi đè", EditorStyles.boldLabel);
            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUI.BeginChangeCheck();
                zipPath = EditorGUILayout.TextField("Tệp .zip", zipPath);
                bool changed = EditorGUI.EndChangeCheck();
                if (GUILayout.Button("Chọn…", GUILayout.Width(60)))
                {
                    var dir = string.IsNullOrEmpty(zipPath) ? "" : Path.GetDirectoryName(UILayoutImporter.ToFullPath(zipPath));
                    var p = EditorUtility.OpenFilePanel("Chọn gói layout", dir, "zip");
                    if (!string.IsNullOrEmpty(p)) { zipPath = UILayoutImporter.ToStoredPath(p); changed = true; GUI.FocusControl(null); }
                }
                if (changed)
                {
                    EditorPrefs.SetString(PrefKey + "zip", zipPath);
                    LoadPreview();
                }
            }
            if (previewError != null) EditorGUILayout.HelpBox(previewError, MessageType.Error);
            else if (preview != null)
                EditorGUILayout.HelpBox($"{preview.name}: {preview.Walk().Count()} node, {preview.sprites.Count} sprite, canvas {preview.canvas.referenceResolution.x}x{preview.canvas.referenceResolution.y} {preview.canvas.screenMatchMode}", MessageType.None);

            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUI.BeginChangeCheck();
                spriteFolder = EditorGUILayout.TextField("Thư mục sprite", spriteFolder);
                if (EditorGUI.EndChangeCheck()) spriteFolderEdited = true;
                if (GUILayout.Button("Chọn…", GUILayout.Width(60)))
                {
                    var p = EditorUtility.OpenFolderPanel("Thư mục sprite", "Assets", "");
                    var rel = string.IsNullOrEmpty(p) ? null : UILayoutImporter.ToStoredPath(p);
                    if (rel != null && rel.StartsWith("Assets")) { spriteFolder = rel; spriteFolderEdited = true; GUI.FocusControl(null); }
                    else if (rel != null) EditorUtility.DisplayDialog("UI Layout Studio", "Thư mục sprite phải nằm trong Assets/.", "OK");
                }
            }
            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUI.BeginChangeCheck();
                prefabPath = EditorGUILayout.TextField("Prefab", prefabPath);
                if (EditorGUI.EndChangeCheck()) prefabPathEdited = true;
                if (GUILayout.Button("Chọn…", GUILayout.Width(60)))
                {
                    var name = Path.GetFileNameWithoutExtension(prefabPath);
                    var p = EditorUtility.SaveFilePanelInProject("Lưu prefab", string.IsNullOrEmpty(name) ? "Layout" : name, "prefab", "", Path.GetDirectoryName(prefabPath));
                    if (!string.IsNullOrEmpty(p)) { prefabPath = p; prefabPathEdited = true; GUI.FocusControl(null); }
                }
            }
            if (GUILayout.Button("Đường dẫn mặc định", EditorStyles.miniButton, GUILayout.Width(140)))
            {
                spriteFolderEdited = prefabPathEdited = false;
                LoadPreview();
            }

            EditorGUILayout.Space();
            using (new EditorGUI.DisabledScope(preview == null))
            {
                if (GUILayout.Button(File.Exists(UILayoutImporter.ToFullPath(prefabPath ?? "")) ? "Import (cập nhật prefab đã có)" : "Import", GUILayout.Height(30)))
                    RunImport();
            }

            EditorGUILayout.Space();
            DrawSettings();
            EditorGUILayout.EndScrollView();
        }

        private void DrawReimportSelection()
        {
            var go = Selection.activeObject as GameObject;
            if (go == null || !EditorUtility.IsPersistent(go) || go.GetComponent<UILayoutRoot>() == null) return;
            var lr = go.GetComponent<UILayoutRoot>();
            EditorGUILayout.LabelField("Prefab đang chọn", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox($"{AssetDatabase.GetAssetPath(go)}\nNguồn: {lr.sourceZipPath}\nLần import trước: {lr.lastImportTime}", MessageType.Info);
            if (GUILayout.Button("Re-import " + go.name, GUILayout.Height(26))) UILayoutStudioMenus.ReimportWithDialog(go);
            EditorGUILayout.Space();
        }

        private void DrawSettings()
        {
            EditorGUILayout.LabelField("Cài đặt project", EditorStyles.boldLabel);
            if (settings == null)
            {
                EditorGUILayout.HelpBox("Chưa có asset cài đặt: font sẽ tự tìm theo tên (\"<font> SDF\"), safe area dùng " + UILayoutStudioSettings.DefaultSafeAreaType + ".", MessageType.None);
                if (GUILayout.Button("Tạo " + UILayoutStudioSettings.DefaultAssetPath))
                {
                    settings = UILayoutStudioSettings.GetOrCreate();
                    settingsSO = new SerializedObject(settings);
                }
                return;
            }
            EditorGUILayout.ObjectField("Asset", settings, typeof(UILayoutStudioSettings), false);
            settingsSO.Update();
            var typeProp = settingsSO.FindProperty(nameof(UILayoutStudioSettings.safeAreaComponentType));
            EditorGUILayout.PropertyField(typeProp, new GUIContent("Component safe area"));
            var t = UILayoutImporter.FindComponentType(typeProp.stringValue);
            EditorGUILayout.LabelField(" ", t != null ? "✓ " + t.AssemblyQualifiedName.Split(',')[0] + " (" + t.Assembly.GetName().Name + ")" : "✗ không tìm thấy, SafeArea chỉ kéo giãn", EditorStyles.miniLabel);
            EditorGUILayout.PropertyField(settingsSO.FindProperty(nameof(UILayoutStudioSettings.spriteFolderTemplate)), new GUIContent("Mẫu thư mục sprite"));
            EditorGUILayout.PropertyField(settingsSO.FindProperty(nameof(UILayoutStudioSettings.prefabPathTemplate)), new GUIContent("Mẫu đường dẫn prefab"));
            EditorGUILayout.PropertyField(settingsSO.FindProperty(nameof(UILayoutStudioSettings.tmpMaterialFolder)), new GUIContent("Thư mục material TMP"));
            EditorGUILayout.PropertyField(settingsSO.FindProperty(nameof(UILayoutStudioSettings.autoFindFontByName)), new GUIContent("Tự tìm font theo tên"));
            EditorGUILayout.PropertyField(settingsSO.FindProperty(nameof(UILayoutStudioSettings.fonts)), new GUIContent("Ánh xạ font"), true);
            settingsSO.ApplyModifiedProperties();

            if (preview != null)
            {
                var used = new HashSet<string>(preview.Walk().Where(w => w.node.text != null && !string.IsNullOrEmpty(w.node.text.font)).Select(w => w.node.text.font));
                var missing = used.Where(f => !settings.fonts.Any(m => m != null && m.font != null && string.Equals(m.logicalName, f, StringComparison.OrdinalIgnoreCase))).ToList();
                if (missing.Count > 0)
                {
                    EditorGUILayout.HelpBox("Font trong layout chưa ánh xạ: " + string.Join(", ", missing), MessageType.Warning);
                    if (GUILayout.Button("Thêm dòng ánh xạ cho các font này"))
                    {
                        Undo.RecordObject(settings, "Thêm ánh xạ font");
                        foreach (var f in missing)
                            if (!settings.fonts.Any(m => m != null && m.logicalName == f))
                                settings.fonts.Add(new UILayoutStudioSettings.FontMapping { logicalName = f });
                        EditorUtility.SetDirty(settings);
                        AssetDatabase.SaveAssets();
                    }
                }
            }
        }

        private void RunImport()
        {
            try
            {
                if (settings != null) AssetDatabase.SaveAssetIfDirty(settings);
                var r = UILayoutImporter.Import(new ImportOptions { zipPath = zipPath, spriteFolder = spriteFolder, prefabPath = prefabPath, settings = settings });
                EditorGUIUtility.PingObject(r.prefab);
                Selection.activeObject = r.prefab;
                UILayoutStudioMenus.ShowResult(r);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                EditorUtility.DisplayDialog("UI Layout Studio", "Import lỗi: " + e.Message, "OK");
            }
        }
    }

    public static class UILayoutStudioMenus
    {
        private const string AssetMenu = "Assets/UI Layout Studio/Re-import";

        [MenuItem(AssetMenu, priority = 2000)]
        private static void ReimportSelected()
        {
            foreach (var go in Selection.gameObjects.Where(IsLayoutPrefab).ToList()) ReimportWithDialog(go);
        }

        [MenuItem(AssetMenu, true)]
        private static bool ReimportSelectedValidate() => Selection.gameObjects.Any(IsLayoutPrefab);

        [MenuItem("CONTEXT/UILayoutRoot/Re-import")]
        private static void ReimportFromContext(MenuCommand cmd)
        {
            var lr = cmd.context as UILayoutRoot;
            if (lr == null) return;
            var asset = EditorUtility.IsPersistent(lr) ? lr.gameObject : PrefabUtility.GetCorrespondingObjectFromSource(lr.gameObject);
            if (asset == null)
            {
                var stage = UnityEditor.SceneManagement.PrefabStageUtility.GetPrefabStage(lr.gameObject);
                if (stage != null) asset = AssetDatabase.LoadAssetAtPath<GameObject>(stage.assetPath);
            }
            if (asset == null) { EditorUtility.DisplayDialog("UI Layout Studio", "Không tìm thấy prefab asset của UILayoutRoot này.", "OK"); return; }
            ReimportWithDialog(asset.transform.root.gameObject);
        }

        [MenuItem("Tools/UI Layout Studio/Re-import Selected Prefab", priority = 1)]
        private static void ReimportFromTools() => ReimportSelected();

        [MenuItem("Tools/UI Layout Studio/Re-import Selected Prefab", true)]
        private static bool ReimportFromToolsValidate() => ReimportSelectedValidate();

        private static bool IsLayoutPrefab(GameObject go) =>
            go != null && EditorUtility.IsPersistent(go) && go.GetComponent<UILayoutRoot>() != null;

        public static void ReimportWithDialog(GameObject prefabAsset)
        {
            try
            {
                var lr = prefabAsset.GetComponent<UILayoutRoot>();
                string overridePath = null;
                if (!File.Exists(UILayoutImporter.ToFullPath(lr.sourceZipPath ?? "")))
                {
                    if (Application.isBatchMode) throw new FileNotFoundException("Không thấy tệp nguồn: " + lr.sourceZipPath);
                    overridePath = EditorUtility.OpenFilePanel($"Không thấy {lr.sourceZipPath}. Chọn lại gói layout", "", "zip");
                    if (string.IsNullOrEmpty(overridePath)) return;
                }
                var r = UILayoutImporter.Reimport(prefabAsset, overridePath);
                ShowResult(r);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                if (!Application.isBatchMode) EditorUtility.DisplayDialog("UI Layout Studio", "Re-import lỗi: " + e.Message, "OK");
            }
        }

        public static void ShowResult(ImportResult r)
        {
            if (Application.isBatchMode) return;
            var msg = r.ToString();
            if (r.warnings.Count > 0)
                msg += "\n\nCảnh báo:\n- " + string.Join("\n- ", r.warnings.Take(12)) + (r.warnings.Count > 12 ? "\n… (xem Console)" : "");
            EditorUtility.DisplayDialog("UI Layout Studio", msg, "OK");
        }
    }

    [CustomEditor(typeof(UILayoutRoot))]
    public sealed class UILayoutRootEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            var lr = (UILayoutRoot)target;
            if (!EditorUtility.IsPersistent(lr) || lr.transform.parent != null) return;
            EditorGUILayout.Space();
            if (GUILayout.Button("Re-import", GUILayout.Height(24))) UILayoutStudioMenus.ReimportWithDialog(lr.gameObject);
        }
    }
}
