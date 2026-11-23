using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace UILayoutStudio.EditorTools
{
    public sealed class ImportOptions
    {
        /// <summary>Tệp .zip (layout.json + sprites/*.png). Tuyệt đối hoặc tương đối với thư mục project.</summary>
        public string zipPath;
        /// <summary>Thư mục sprite trong project (bắt đầu bằng Assets/). Trống = theo mẫu trong cài đặt.</summary>
        public string spriteFolder;
        /// <summary>Đường dẫn prefab (Assets/.../X.prefab). Trống = theo mẫu trong cài đặt.</summary>
        public string prefabPath;
        /// <summary>Type component safe area. Trống = theo cài đặt project.</summary>
        public string safeAreaComponentType;
        /// <summary>Cài đặt project. null = tìm asset trong project (không có thì dùng mặc định).</summary>
        public UILayoutStudioSettings settings;
    }

    public sealed class ImportResult
    {
        public string prefabPath;
        public GameObject prefab;
        public LayoutDocument document;
        public readonly List<string> warnings = new List<string>();
        public int created, updated, deleted, rescued, spritesImported;

        public override string ToString() =>
            $"{prefabPath}: tạo {created}, cập nhật {updated}, xoá {deleted} node, giữ lại {rescued} GameObject của dev, " +
            $"{spritesImported} sprite, {warnings.Count} cảnh báo";
    }

    /// <summary>
    /// Import gói UI Layout Studio thành prefab uGUI. Import lại khớp node theo nodeId và chỉ ghi đè
    /// các giá trị có trong layout.json; GameObject/component dev tự thêm được giữ nguyên.
    /// </summary>
    public static class UILayoutImporter
    {
        private const string LogPrefix = "[UI Layout Studio] ";

        // ---------------------------------------------------------------- API

        public static ImportResult Import(ImportOptions options)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            var settings = options.settings != null ? options.settings : UILayoutStudioSettings.FindOrDefault();
            var zipFull = ToFullPath(options.zipPath);
            if (!File.Exists(zipFull)) throw new FileNotFoundException("Không thấy tệp zip: " + zipFull);

            var result = new ImportResult();
            LayoutDocument doc;
            var spriteBytes = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            using (var zip = new ZipArchive(File.OpenRead(zipFull), ZipArchiveMode.Read))
            {
                var layoutEntry = zip.Entries.FirstOrDefault(e => NormalizeEntry(e.FullName) == "layout.json")
                                  ?? zip.Entries.FirstOrDefault(e => NormalizeEntry(e.FullName).EndsWith("/layout.json"));
                if (layoutEntry == null) throw new FormatException("Tệp zip không có layout.json.");
                string prefix = NormalizeEntry(layoutEntry.FullName);
                prefix = prefix.Substring(0, prefix.Length - "layout.json".Length);
                using (var r = new StreamReader(layoutEntry.Open(), Encoding.UTF8)) doc = LayoutDocument.Parse(r.ReadToEnd());
                foreach (var e in zip.Entries)
                {
                    var name = NormalizeEntry(e.FullName);
                    if (!name.StartsWith(prefix + "sprites/") || name.EndsWith("/")) continue;
                    using (var s = e.Open())
                    using (var ms = new MemoryStream())
                    {
                        s.CopyTo(ms);
                        spriteBytes[name.Substring(prefix.Length + "sprites/".Length)] = ms.ToArray();
                    }
                }
            }
            result.document = doc;
            CheckUniqueIds(doc);

            var spriteFolder = string.IsNullOrWhiteSpace(options.spriteFolder)
                ? UILayoutStudioSettings.Expand(settings.spriteFolderTemplate, doc.name) : options.spriteFolder.Trim();
            var prefabPath = string.IsNullOrWhiteSpace(options.prefabPath)
                ? UILayoutStudioSettings.Expand(settings.prefabPathTemplate, doc.name) : options.prefabPath.Trim();
            spriteFolder = spriteFolder.Replace('\\', '/').TrimEnd('/');
            prefabPath = prefabPath.Replace('\\', '/');
            if (!spriteFolder.StartsWith("Assets")) throw new ArgumentException("Thư mục sprite phải nằm trong Assets/: " + spriteFolder);
            if (!prefabPath.StartsWith("Assets/") || !prefabPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Đường dẫn prefab phải dạng Assets/.../Ten.prefab: " + prefabPath);

            var sprites = ImportSprites(doc, spriteBytes, spriteFolder, result);

            var safeTypeName = string.IsNullOrWhiteSpace(options.safeAreaComponentType)
                ? settings.safeAreaComponentType : options.safeAreaComponentType.Trim();
            var ctx = new BuildContext
            {
                doc = doc,
                sprites = sprites,
                settings = settings,
                result = result,
                safeAreaType = string.IsNullOrWhiteSpace(safeTypeName) ? null : FindComponentType(safeTypeName),
                safeAreaTypeName = safeTypeName,
            };
            if (ctx.safeAreaType == null && !string.IsNullOrWhiteSpace(safeTypeName) && doc.Walk().Any(w => w.node.type == LayoutNodeData.TypeSafeArea))
                Warn(result, $"Không tìm thấy type component safe area \"{safeTypeName}\". Node SafeArea vẫn được tạo (kéo giãn toàn cha) nhưng không tự thu vào safe area.");

            EnsureFolder(Path.GetDirectoryName(prefabPath)?.Replace('\\', '/'));
            bool exists = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath) != null;
            GameObject root = exists ? PrefabUtility.LoadPrefabContents(prefabPath) : new GameObject(doc.root.name, typeof(RectTransform));
            try
            {
                Build(root, ctx);
                var layoutRoot = root.GetComponent<UILayoutRoot>() ?? root.AddComponent<UILayoutRoot>();
                layoutRoot.sourceZipPath = ToStoredPath(zipFull);
                layoutRoot.spriteFolder = spriteFolder;
                layoutRoot.safeAreaComponentType = options.safeAreaComponentType ?? "";
                layoutRoot.layoutName = doc.name;
                layoutRoot.lastImportTime = DateTime.Now.ToString("s");

                result.prefab = PrefabUtility.SaveAsPrefabAsset(root, prefabPath, out bool ok);
                if (!ok || result.prefab == null) throw new Exception("Lưu prefab thất bại: " + prefabPath);
            }
            finally
            {
                if (exists) PrefabUtility.UnloadPrefabContents(root);
                else Object.DestroyImmediate(root);
            }
            result.prefabPath = prefabPath;
            Debug.Log(LogPrefix + "Import xong " + result);
            return result;
        }

        /// <summary>Import lại prefab đã có <see cref="UILayoutRoot"/> bằng cài đặt lưu trong nó.</summary>
        public static ImportResult Reimport(GameObject prefabAsset, string overrideZipPath = null)
        {
            var path = AssetDatabase.GetAssetPath(prefabAsset);
            var lr = prefabAsset != null ? prefabAsset.GetComponent<UILayoutRoot>() : null;
            if (string.IsNullOrEmpty(path) || lr == null)
                throw new ArgumentException("Cần chọn prefab asset có component UILayoutRoot.");
            return Import(new ImportOptions
            {
                zipPath = string.IsNullOrEmpty(overrideZipPath) ? lr.sourceZipPath : overrideZipPath,
                spriteFolder = lr.spriteFolder,
                prefabPath = path,
                safeAreaComponentType = lr.safeAreaComponentType,
            });
        }

        /// <summary>Đọc layout.json trong zip mà không import (để lấy tên, kiểm định dạng).</summary>
        public static LayoutDocument ReadDocument(string zipPath)
        {
            using (var zip = new ZipArchive(File.OpenRead(ToFullPath(zipPath)), ZipArchiveMode.Read))
            {
                var e = zip.Entries.FirstOrDefault(x => NormalizeEntry(x.FullName) == "layout.json")
                        ?? zip.Entries.FirstOrDefault(x => NormalizeEntry(x.FullName).EndsWith("/layout.json"));
                if (e == null) throw new FormatException("Tệp zip không có layout.json.");
                using (var r = new StreamReader(e.Open(), Encoding.UTF8)) return LayoutDocument.Parse(r.ReadToEnd());
            }
        }

        /// <summary>Tìm type component theo tên đầy đủ trong mọi assembly đang nạp.</summary>
        public static Type FindComponentType(string typeName)
        {
            if (string.IsNullOrWhiteSpace(typeName)) return null;
            Type byShortName = null;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type t;
                try { t = asm.GetType(typeName, false); }
                catch { continue; }
                if (t != null && typeof(Component).IsAssignableFrom(t) && !t.IsAbstract) return t;
                if (byShortName == null && !typeName.Contains("."))
                {
                    try
                    {
                        byShortName = asm.GetTypes().FirstOrDefault(x => x.Name == typeName && typeof(Component).IsAssignableFrom(x) && !x.IsAbstract);
                    }
                    catch { /* assembly không đọc được type */ }
                }
            }
            return byShortName;
        }

        // ---------------------------------------------------------------- Sprite

        private static Dictionary<string, Sprite> ImportSprites(LayoutDocument doc, Dictionary<string, byte[]> bytes, string folder, ImportResult result)
        {
            var map = new Dictionary<string, Sprite>();
            if (doc.sprites.Count == 0) return map;
            EnsureFolder(folder);

            var paths = new List<(LayoutSprite sprite, string path)>();
            foreach (var sp in doc.sprites)
            {
                var file = Path.GetFileName(sp.file);
                if (!bytes.TryGetValue(file, out var data))
                {
                    Warn(result, $"Thiếu tệp sprites/{file} trong zip (sprite id {sp.id}).");
                    continue;
                }
                var assetPath = folder + "/" + file;
                var full = ToFullPath(assetPath);
                if (!File.Exists(full) || !File.ReadAllBytes(full).SequenceEqual(data)) File.WriteAllBytes(full, data);
                paths.Add((sp, assetPath));
            }

            AssetDatabase.StartAssetEditing();
            try
            {
                foreach (var (_, path) in paths) AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            }
            finally { AssetDatabase.StopAssetEditing(); }

            float ppu = doc.canvas.referencePixelsPerUnit > 0 ? doc.canvas.referencePixelsPerUnit : 100f;
            foreach (var (sp, path) in paths)
            {
                if (!(AssetImporter.GetAtPath(path) is TextureImporter ti))
                {
                    Warn(result, "Không đọc được TextureImporter cho " + path);
                    continue;
                }
                if (ConfigureTextureImporter(ti, sp, ppu)) ti.SaveAndReimport();
                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                if (sprite == null) Warn(result, "Không nạp được Sprite từ " + path);
                else
                {
                    map[sp.id] = sprite;
                    result.spritesImported++;
                }
            }
            return map;
        }

        /// <summary>Đặt cài đặt texture cho sprite UI. Trả về true nếu có thay đổi.</summary>
        private static bool ConfigureTextureImporter(TextureImporter ti, LayoutSprite sp, float ppu)
        {
            var ts = new TextureImporterSettings();
            ti.ReadTextureSettings(ts);
            bool changed =
                ts.textureType != TextureImporterType.Sprite ||
                ti.spriteImportMode != SpriteImportMode.Single ||
                ts.spriteAlignment != (int)SpriteAlignment.Center ||
                ts.spriteBorder != sp.border ||
                !Mathf.Approximately(ts.spritePixelsPerUnit, ppu) ||
                ts.spriteMeshType != SpriteMeshType.FullRect ||
                ts.mipmapEnabled ||
                !ts.alphaIsTransparency ||
                ts.alphaSource != TextureImporterAlphaSource.FromInput ||
                ts.npotScale != TextureImporterNPOTScale.None ||
                ts.wrapMode != TextureWrapMode.Clamp;
            if (!changed) return false;

            ts.textureType = TextureImporterType.Sprite;
            ts.spriteMode = (int)SpriteImportMode.Single;
            ts.spriteAlignment = (int)SpriteAlignment.Center;
            ts.spritePivot = new Vector2(0.5f, 0.5f);
            ts.spriteBorder = sp.border; // (l, b, r, t)
            ts.spritePixelsPerUnit = ppu;
            ts.spriteMeshType = SpriteMeshType.FullRect;
            ts.mipmapEnabled = false;
            ts.alphaIsTransparency = true;
            ts.alphaSource = TextureImporterAlphaSource.FromInput;
            ts.npotScale = TextureImporterNPOTScale.None;
            ts.wrapMode = TextureWrapMode.Clamp;
            ti.SetTextureSettings(ts);
            ti.spriteImportMode = SpriteImportMode.Single;
            ti.spriteBorder = sp.border;
            ti.spritePivot = new Vector2(0.5f, 0.5f);
            return true;
        }

        // ---------------------------------------------------------------- Prefab

        private sealed class BuildContext
        {
            public LayoutDocument doc;
            public Dictionary<string, Sprite> sprites;
            public UILayoutStudioSettings settings;
            public ImportResult result;
            public Type safeAreaType;
            public string safeAreaTypeName;
            public Dictionary<string, GameObject> index;
            public readonly HashSet<GameObject> matched = new HashSet<GameObject>();
            public readonly Dictionary<string, TMP_FontAsset> fontCache = new Dictionary<string, TMP_FontAsset>();
            /// <summary>(tên preset, font) → material, null = không có material dùng được.</summary>
            public readonly Dictionary<(string, TMP_FontAsset), Material> presetCache = new Dictionary<(string, TMP_FontAsset), Material>();
            /// <summary>Tên asset preset tự tạo → material.</summary>
            public readonly Dictionary<string, Material> generatedCache = new Dictionary<string, Material>();
        }

        private static void Build(GameObject root, BuildContext ctx)
        {
            // Chỉ mục node cũ theo nodeId. Id trùng (dev nhân bản node) thì bản đầu tiên được khớp,
            // các bản sau coi như GameObject của dev.
            ctx.index = new Dictionary<string, GameObject>();
            foreach (var n in root.GetComponentsInChildren<UILayoutNode>(true))
            {
                if (string.IsNullOrEmpty(n.nodeId)) continue;
                if (n.gameObject == root) continue;
                if (ctx.index.ContainsKey(n.nodeId))
                    Warn(ctx.result, $"Có nhiều GameObject cùng nodeId \"{n.nodeId}\" ({n.name}); chỉ bản đầu được cập nhật, bản còn lại giữ nguyên.");
                else ctx.index[n.nodeId] = n.gameObject;
            }

            // Gốc prefab luôn ứng với root của layout.
            var rootNode = root.GetComponent<UILayoutNode>() ?? root.AddComponent<UILayoutNode>();
            bool rootIsNew = string.IsNullOrEmpty(rootNode.nodeId);
            rootNode.nodeId = ctx.doc.root.id;
            ctx.matched.Add(root);
            ApplyNode(root, ctx.doc.root, ctx, isRoot: true);
            if (rootIsNew) ctx.result.created++; else ctx.result.updated++;
            ApplyChildren(root, ctx.doc.root, ctx);

            // Xoá node không còn trong file, giữ GameObject của dev bên dưới.
            var fileIds = new HashSet<string>(ctx.doc.Walk().Select(w => w.node.id));
            var orphans = root.GetComponentsInChildren<UILayoutNode>(true)
                .Where(n => n.gameObject != root && !ctx.matched.Contains(n.gameObject) && !string.IsNullOrEmpty(n.nodeId) && !fileIds.Contains(n.nodeId))
                .Select(n => n.gameObject)
                .ToList();
            var orphanSet = new HashSet<GameObject>(orphans);
            foreach (var o in orphans)
            {
                if (o == null) continue;
                var p = o.transform.parent;
                bool topLevel = true;
                for (var t = p; t != null; t = t.parent)
                    if (orphanSet.Contains(t.gameObject)) { topLevel = false; break; }
                if (topLevel) DeleteNode(o, p, o.transform.GetSiblingIndex(), ctx);
            }
        }

        private static void ApplyChildren(GameObject parentGo, LayoutNodeData parent, BuildContext ctx)
        {
            var desired = new List<Transform>();
            foreach (var child in parent.children)
            {
                if (!ctx.index.TryGetValue(child.id, out var go) || go == null)
                {
                    go = new GameObject(child.name, typeof(RectTransform));
                    go.layer = parentGo.layer;
                    go.AddComponent<UILayoutNode>().nodeId = child.id;
                    go.transform.SetParent(parentGo.transform, false);
                    ctx.index[child.id] = go;
                    ctx.result.created++;
                }
                else
                {
                    if (go.transform.parent != parentGo.transform) go.transform.SetParent(parentGo.transform, false);
                    ctx.result.updated++;
                }
                ctx.matched.Add(go);
                ApplyNode(go, child, ctx, isRoot: false);
                desired.Add(go.transform);
                ApplyChildren(go, child, ctx);
            }
            ReorderSiblings(parentGo.transform, desired);
        }

        /// <summary>
        /// Xếp các node của layout theo đúng thứ tự trong file. GameObject của dev giữ nguyên vị trí (slot) cũ;
        /// các slot đang do node layout chiếm được điền lại theo thứ tự mong muốn.
        /// </summary>
        private static void ReorderSiblings(Transform parent, List<Transform> desired)
        {
            if (desired.Count == 0) return;
            var set = new HashSet<Transform>(desired);
            var current = new List<Transform>();
            for (int i = 0; i < parent.childCount; i++) current.Add(parent.GetChild(i));
            var final = new List<Transform>(current.Count);
            int k = 0;
            foreach (var t in current) final.Add(set.Contains(t) ? desired[k++] : t);
            for (int i = 0; i < final.Count; i++)
                if (final[i].GetSiblingIndex() != i) final[i].SetSiblingIndex(i);
        }

        private static void DeleteNode(GameObject go, Transform rescueParent, int insertIndex, BuildContext ctx)
        {
            // Duyệt con: node layout mồ côi thì xoá tiếp (đệ quy), GameObject của dev thì chuyển lên rescueParent.
            var children = new List<Transform>();
            for (int i = 0; i < go.transform.childCount; i++) children.Add(go.transform.GetChild(i));
            foreach (var c in children)
            {
                var ln = c.GetComponent<UILayoutNode>();
                if (ln != null && !ctx.matched.Contains(c.gameObject))
                {
                    insertIndex = DeleteNodeReturnIndex(c.gameObject, rescueParent, insertIndex, ctx);
                }
                else
                {
                    c.SetParent(rescueParent, true);
                    c.SetSiblingIndex(Mathf.Min(insertIndex, rescueParent.childCount - 1));
                    insertIndex++;
                    ctx.result.rescued++;
                    Warn(ctx.result, $"Node \"{go.name}\" đã bị xoá khỏi layout nhưng có GameObject \"{c.name}\" do dev thêm bên dưới: đã chuyển \"{c.name}\" lên \"{rescueParent.name}\".");
                }
            }
            var devComponents = go.GetComponents<Component>().Where(c => c != null && !IsImporterComponent(c, ctx)).Select(c => c.GetType().Name).ToList();
            if (devComponents.Count > 0)
                Warn(ctx.result, $"Node \"{go.name}\" bị xoá cùng các component dev đã thêm: {string.Join(", ", devComponents)}.");
            Object.DestroyImmediate(go);
            ctx.result.deleted++;
        }

        private static int DeleteNodeReturnIndex(GameObject go, Transform rescueParent, int insertIndex, BuildContext ctx)
        {
            int before = rescueParent.childCount;
            DeleteNode(go, rescueParent, insertIndex, ctx);
            return insertIndex + (rescueParent.childCount - before);
        }

        private static bool IsImporterComponent(Component c, BuildContext ctx)
        {
            if (c is Transform || c is CanvasRenderer || c is UILayoutNode || c is Image || c is TextMeshProUGUI) return true;
            if (ctx.safeAreaType != null && ctx.safeAreaType.IsInstanceOfType(c)) return true;
            var ln = c.GetComponent<UILayoutNode>();
            return ln != null && ln.managedComponents != null && ln.managedComponents.Contains(c.GetType().FullName);
        }

        private static void ApplyNode(GameObject go, LayoutNodeData n, BuildContext ctx, bool isRoot)
        {
            var ln = go.GetComponent<UILayoutNode>() ?? go.AddComponent<UILayoutNode>();
            if (ln.managedComponents == null) ln.managedComponents = new List<string>();
            string prevType = ln.nodeType;
            if (go.name != n.name) go.name = n.name;

            var rt = go.GetComponent<RectTransform>() ?? go.AddComponent<RectTransform>();

            // Bỏ component do importer thêm ở lần trước nếu node đổi loại.
            if (prevType == LayoutNodeData.TypeImage && n.type != LayoutNodeData.TypeImage) DestroyIfAny<Image>(go);
            if (prevType == LayoutNodeData.TypeText && n.type != LayoutNodeData.TypeText) DestroyIfAny<TextMeshProUGUI>(go);
            if (prevType == LayoutNodeData.TypeSafeArea && n.type != LayoutNodeData.TypeSafeArea && ctx.safeAreaType != null)
            {
                var c = go.GetComponent(ctx.safeAreaType);
                if (c != null) Object.DestroyImmediate(c);
            }

            switch (n.type)
            {
                case LayoutNodeData.TypeImage: ApplyImage(go, n, ctx); break;
                case LayoutNodeData.TypeText: ApplyText(go, n, ctx); break;
                case LayoutNodeData.TypeSafeArea:
                    if (ctx.safeAreaType != null && go.GetComponent(ctx.safeAreaType) == null) go.AddComponent(ctx.safeAreaType);
                    break;
            }

            // Component tuỳ chọn (layout group, LayoutElement, ContentSizeFitter, Mask). Thêm xong mới gán RectTransform.
            ApplyLayoutGroup(go, ln, n, ctx);
            ApplyLayoutElement(go, ln, n, ctx);
            ApplyContentSizeFitter(go, ln, n, ctx);
            ApplyMask(go, ln, n, ctx);

            if (isRoot || n.type == LayoutNodeData.TypeSafeArea)
            {
                // root: luôn kéo giãn toàn màn. SafeArea: kéo giãn toàn cha, component safe area thu vào.
                rt.anchorMin = Vector2.zero;
                rt.anchorMax = Vector2.one;
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.anchoredPosition = Vector2.zero;
                rt.sizeDelta = Vector2.zero;
                rt.localEulerAngles = Vector3.zero;
                rt.localScale = Vector3.one;
            }
            else
            {
                // Node do layout group/ContentSizeFitter điều khiển vẫn được gán đủ giá trị trong file
                // (giá trị đã tính ở máy artist); Unity tự tính lại khi chạy.
                var r = n.rect;
                rt.anchorMin = r.anchorMin;
                rt.anchorMax = r.anchorMax;
                rt.pivot = r.pivot;
                rt.anchoredPosition = r.anchoredPosition;
                rt.sizeDelta = r.sizeDelta;
                rt.localEulerAngles = new Vector3(0, 0, r.rotation);
                rt.localScale = new Vector3(r.scale.x, r.scale.y, 1);
            }

            ln.nodeType = n.type;
            if (go.activeSelf != n.active) go.SetActive(n.active);
        }

        // ---------------------------------------------------------------- Component tuỳ chọn

        private static readonly Type[] LayoutGroupKinds = { typeof(HorizontalLayoutGroup), typeof(VerticalLayoutGroup), typeof(GridLayoutGroup) };
        private static readonly Type[] LayoutElementKinds = { typeof(LayoutElement) };
        private static readonly Type[] FitterKinds = { typeof(ContentSizeFitter) };
        private static readonly Type[] MaskKinds = { typeof(Mask), typeof(RectMask2D) };

        /// <summary>
        /// Đồng bộ một nhóm component tuỳ chọn cùng vai trò (vd ba loại layout group). <paramref name="desired"/> là type
        /// file yêu cầu, null = file không có trường. Chỉ gỡ component có tên trong <see cref="UILayoutNode.managedComponents"/>
        /// (importer đã thêm); component dev tự thêm được giữ, trừ khi file yêu cầu loại khác cùng vai trò (thay kèm cảnh báo,
        /// vì Unity không cho hai layout group trên một GameObject). Component cùng loại dev đã thêm sẵn thì dùng lại
        /// (gán giá trị theo file) nhưng vẫn coi là của dev.
        /// </summary>
        private static Component SyncOptional(GameObject go, UILayoutNode ln, Type desired, Type[] kinds, BuildContext ctx, string nodeName)
        {
            Component keep = null;
            foreach (var t in kinds)
            {
                var c = go.GetComponent(t);
                bool managed = ln.managedComponents.Contains(t.FullName);
                if (c == null)
                {
                    if (managed && t != desired) ln.managedComponents.Remove(t.FullName);
                    continue;
                }
                if (t == desired) { keep = c; continue; }
                if (managed)
                {
                    Object.DestroyImmediate(c);
                    ln.managedComponents.Remove(t.FullName);
                }
                else if (desired != null)
                {
                    Warn(ctx.result, $"Node \"{nodeName}\": layout cần {desired.Name} nên đã thay {t.Name} (do dev thêm).");
                    Object.DestroyImmediate(c);
                }
                // desired == null và component của dev: giữ nguyên.
            }
            if (desired != null && keep == null)
            {
                keep = go.AddComponent(desired);
                if (keep == null)
                {
                    Warn(ctx.result, $"Node \"{nodeName}\": không thêm được {desired.Name} (GameObject đã có component xung đột).");
                    return null;
                }
                if (!ln.managedComponents.Contains(desired.FullName)) ln.managedComponents.Add(desired.FullName);
            }
            return keep;
        }

        private static TEnum ParseEnum<TEnum>(string value, TEnum def, string field, string nodeName, BuildContext ctx) where TEnum : struct
        {
            if (string.IsNullOrEmpty(value)) return def;
            if (!char.IsDigit(value[0]) && value[0] != '-' && Enum.TryParse(value, false, out TEnum r) && Enum.IsDefined(typeof(TEnum), r)) return r;
            Warn(ctx.result, $"Node \"{nodeName}\": {field} = \"{value}\" không hợp lệ, dùng {def}.");
            return def;
        }

        private static void ApplyLayoutGroup(GameObject go, UILayoutNode ln, LayoutNodeData n, BuildContext ctx)
        {
            var d = n.layoutGroup;
            Type desired = null;
            if (d != null)
            {
                switch (d.type)
                {
                    case LayoutGroupData.Horizontal: desired = typeof(HorizontalLayoutGroup); break;
                    case LayoutGroupData.Vertical: desired = typeof(VerticalLayoutGroup); break;
                    case LayoutGroupData.Grid: desired = typeof(GridLayoutGroup); break;
                    default:
                        Warn(ctx.result, $"Node \"{n.name}\": layoutGroup.type lạ \"{d.type}\", bỏ qua layout group.");
                        break;
                }
            }
            var c = SyncOptional(go, ln, desired, LayoutGroupKinds, ctx, n.name) as LayoutGroup;
            if (c == null || desired == null) return;

            c.padding = new RectOffset(d.paddingLeft, d.paddingRight, d.paddingTop, d.paddingBottom);
            c.childAlignment = ParseEnum(d.childAlignment, TextAnchor.UpperLeft, "layoutGroup.childAlignment", n.name, ctx);
            if (c is HorizontalOrVerticalLayoutGroup hv)
            {
                hv.spacing = d.spacing;
                hv.reverseArrangement = d.reverseArrangement;
                hv.childControlWidth = d.childControlWidth;
                hv.childControlHeight = d.childControlHeight;
                hv.childScaleWidth = d.childScaleWidth;
                hv.childScaleHeight = d.childScaleHeight;
                hv.childForceExpandWidth = d.childForceExpandWidth;
                hv.childForceExpandHeight = d.childForceExpandHeight;
            }
            else if (c is GridLayoutGroup g)
            {
                g.cellSize = d.cellSize;
                g.spacing = d.gridSpacing;
                g.startCorner = ParseEnum(d.startCorner, GridLayoutGroup.Corner.UpperLeft, "layoutGroup.startCorner", n.name, ctx);
                g.startAxis = ParseEnum(d.startAxis, GridLayoutGroup.Axis.Horizontal, "layoutGroup.startAxis", n.name, ctx);
                g.constraint = ParseEnum(d.constraint, GridLayoutGroup.Constraint.Flexible, "layoutGroup.constraint", n.name, ctx);
                g.constraintCount = d.constraintCount;
            }
        }

        private static void ApplyLayoutElement(GameObject go, UILayoutNode ln, LayoutNodeData n, BuildContext ctx)
        {
            var d = n.layoutElement;
            var c = SyncOptional(go, ln, d != null ? typeof(LayoutElement) : null, LayoutElementKinds, ctx, n.name) as LayoutElement;
            if (c == null || d == null) return;
            c.ignoreLayout = d.ignoreLayout;
            c.minWidth = d.minWidth;
            c.minHeight = d.minHeight;
            c.preferredWidth = d.preferredWidth;
            c.preferredHeight = d.preferredHeight;
            c.flexibleWidth = d.flexibleWidth;
            c.flexibleHeight = d.flexibleHeight;
            c.layoutPriority = d.layoutPriority;
        }

        private static void ApplyContentSizeFitter(GameObject go, UILayoutNode ln, LayoutNodeData n, BuildContext ctx)
        {
            var d = n.contentSizeFitter;
            var c = SyncOptional(go, ln, d != null ? typeof(ContentSizeFitter) : null, FitterKinds, ctx, n.name) as ContentSizeFitter;
            if (c == null || d == null) return;
            c.horizontalFit = ParseEnum(d.horizontalFit, ContentSizeFitter.FitMode.Unconstrained, "contentSizeFitter.horizontalFit", n.name, ctx);
            c.verticalFit = ParseEnum(d.verticalFit, ContentSizeFitter.FitMode.Unconstrained, "contentSizeFitter.verticalFit", n.name, ctx);
        }

        private static void ApplyMask(GameObject go, UILayoutNode ln, LayoutNodeData n, BuildContext ctx)
        {
            var d = n.mask;
            Type desired = null;
            if (d != null)
            {
                if (d.type == MaskData.TypeMask) desired = typeof(Mask);
                else if (d.type == MaskData.TypeRectMask2D) desired = typeof(RectMask2D);
                else Warn(ctx.result, $"Node \"{n.name}\": mask.type lạ \"{d.type}\", bỏ qua mask.");
            }
            var c = SyncOptional(go, ln, desired, MaskKinds, ctx, n.name);
            if (c is Mask m && desired == typeof(Mask))
            {
                m.showMaskGraphic = d.showMaskGraphic;
                if (go.GetComponent<Image>() == null)
                    Warn(ctx.result, $"Node \"{n.name}\" có Mask nhưng không có Image cùng node: Mask không cắt được gì (dùng RectMask2D hoặc đổi node thành Image).");
            }
        }

        private static void DestroyIfAny<T>(GameObject go) where T : Component
        {
            var c = go.GetComponent<T>();
            if (c != null) Object.DestroyImmediate(c);
        }

        private static T EnsureGraphic<T>(GameObject go, BuildContext ctx, string nodeName) where T : Graphic
        {
            var c = go.GetComponent<T>();
            if (c != null) return c;
            var other = go.GetComponent<Graphic>();
            if (other != null)
            {
                Warn(ctx.result, $"Node \"{nodeName}\" đã có {other.GetType().Name} nên không thêm được {typeof(T).Name} (mỗi GameObject chỉ một Graphic).");
                return null;
            }
            return go.AddComponent<T>();
        }

        private static void ApplyImage(GameObject go, LayoutNodeData n, BuildContext ctx)
        {
            var img = EnsureGraphic<Image>(go, ctx, n.name);
            if (img == null) return;
            var d = n.image ?? new LayoutImage();
            Sprite sprite = null;
            if (!string.IsNullOrEmpty(d.sprite) && !ctx.sprites.TryGetValue(d.sprite, out sprite))
                Warn(ctx.result, $"Node \"{n.name}\": không có sprite id \"{d.sprite}\", để ô màu trơn.");
            img.sprite = sprite;
            img.color = d.color;
            img.type = d.type == "Sliced" ? Image.Type.Sliced : d.type == "Filled" ? Image.Type.Filled : Image.Type.Simple;
            img.preserveAspect = d.preserveAspect;
            img.raycastTarget = d.raycastTarget;
            if (img.type == Image.Type.Filled)
            {
                // Gán fillMethod trước: setter của nó đặt lại fillOrigin về 0.
                img.fillMethod = ParseEnum(d.fillMethod, Image.FillMethod.Radial360, "image.fillMethod", n.name, ctx);
                img.fillOrigin = d.fillOrigin;
                img.fillAmount = d.fillAmount;
                img.fillClockwise = d.fillClockwise;
            }
            if (img.type == Image.Type.Sliced && sprite != null && sprite.border == Vector4.zero)
                Warn(ctx.result, $"Node \"{n.name}\" dùng Sliced nhưng sprite \"{sprite.name}\" không có border.");
        }

        private static void ApplyText(GameObject go, LayoutNodeData n, BuildContext ctx)
        {
            var tmp = EnsureGraphic<TextMeshProUGUI>(go, ctx, n.name);
            if (tmp == null) return;
            var d = n.text ?? new LayoutText();

            var font = ResolveFont(d.font, ctx);
            if (font != null) tmp.font = font;
            else
            {
                if (tmp.font == null) tmp.font = DefaultTmpFont();
                Warn(ctx.result, $"Node \"{n.name}\": chưa ánh xạ font \"{d.font}\" (Tools > UI Layout Studio > Import > Font), dùng {(tmp.font != null ? tmp.font.name : "font mặc định TMP")}.");
            }

            tmp.text = d.content;
            tmp.fontSize = d.fontSize;
            tmp.color = d.color;
            var style = tmp.fontStyle & ~(FontStyles.Bold | FontStyles.Italic);
            if (d.bold) style |= FontStyles.Bold;
            if (d.italic) style |= FontStyles.Italic;
            tmp.fontStyle = style;
            tmp.horizontalAlignment = d.hAlign == "Left" ? HorizontalAlignmentOptions.Left
                : d.hAlign == "Right" ? HorizontalAlignmentOptions.Right : HorizontalAlignmentOptions.Center;
            tmp.verticalAlignment = d.vAlign == "Top" ? VerticalAlignmentOptions.Top
                : d.vAlign == "Bottom" ? VerticalAlignmentOptions.Bottom : VerticalAlignmentOptions.Middle;
            tmp.textWrappingMode = d.wrap ? TextWrappingModes.Normal : TextWrappingModes.NoWrap;
            tmp.enableAutoSizing = d.autoSize;
            tmp.fontSizeMin = d.fontSizeMin;
            tmp.fontSizeMax = d.fontSizeMax;
            tmp.lineSpacing = d.lineSpacing;
            tmp.characterSpacing = d.characterSpacing;
            tmp.margin = d.margin;
            // Sau khi gán font: đổi font làm TMP đặt lại material.
            ApplyTextMaterial(tmp, go.GetComponent<UILayoutNode>(), d, n.name, ctx);
        }

        // ---------------------------------------------------------------- Material TMP (viền, bóng)

        /// <summary>
        /// Gán fontSharedMaterial theo materialPreset / faceDilate / outline / underlay (docs/FORMAT.md). File không có
        /// trường nào thì chỉ đổi material khi chữ đang dùng material importer gán lần trước hoặc material mặc định của
        /// font; material dev tự gán được giữ.
        /// </summary>
        private static void ApplyTextMaterial(TextMeshProUGUI tmp, UILayoutNode ln, LayoutText d, string nodeName, BuildContext ctx)
        {
            var font = tmp.font;
            if (font == null || ln == null) return;
            var current = tmp.fontSharedMaterial;
            bool ours = current == null || current == ln.managedMaterial || current == font.material;
            if (!d.hasMaterialFields && !ours) return; // dev đã tự đổi material, file không nói gì về material

            Material desired = null;
            if (d.materialPreset != null)
            {
                desired = FindPresetMaterial(d.materialPreset, font, ctx);
                if (desired == null)
                    Warn(ctx.result, $"Node \"{nodeName}\": không tìm thấy material preset \"{d.materialPreset}\" dùng được với font {font.name}" +
                                     (d.HasNonDefaultMaterialParams ? ", tạo/dùng preset theo thông số viền/bóng." : ", dùng material mặc định của font."));
            }
            if (desired == null && d.HasNonDefaultMaterialParams) desired = GetOrCreateGeneratedPreset(font, d, nodeName, ctx);
            if (desired == null) desired = font.material;
            if (desired == null) return;

            if (current != desired) tmp.fontSharedMaterial = desired;
            ln.managedMaterial = desired;
        }

        private static bool UsableWithFont(Material m, TMP_FontAsset font)
        {
            if (m == null || font == null || !m.HasProperty("_MainTex")) return false;
            var tex = m.GetTexture("_MainTex");
            if (tex == null) return false;
            if (font.atlasTexture == tex) return true;
            var atlases = font.atlasTextures;
            if (atlases != null) foreach (var a in atlases) if (a == tex) return true;
            return false;
        }

        /// <summary>
        /// Tìm material tên đúng <paramref name="name"/> dùng được với font (_MainTex là atlas của font). Tìm cả material
        /// mặc định của font, material asset riêng và material là sub-asset của font asset.
        /// </summary>
        private static Material FindPresetMaterial(string name, TMP_FontAsset font, BuildContext ctx)
        {
            if (ctx.presetCache.TryGetValue((name, font), out var cached)) return cached;
            Material found = null, wrongAtlas = null;
            void Consider(Material m)
            {
                if (found != null || m == null || m.name != name) return;
                if (UsableWithFont(m, font)) found = m;
                else if (wrongAtlas == null) wrongAtlas = m;
            }

            Consider(font.material);
            if (found == null)
            {
                var fontPath = AssetDatabase.GetAssetPath(font);
                if (!string.IsNullOrEmpty(fontPath))
                    foreach (var o in AssetDatabase.LoadAllAssetsAtPath(fontPath)) Consider(o as Material);
            }
            if (found == null)
            {
                var seen = new HashSet<string>();
                foreach (var g in AssetDatabase.FindAssets("t:Material " + name))
                {
                    var path = AssetDatabase.GUIDToAssetPath(g);
                    if (!seen.Add(path)) continue;
                    foreach (var o in AssetDatabase.LoadAllAssetsAtPath(path)) Consider(o as Material);
                    if (found != null) break;
                }
            }
            if (found == null)
            {
                // Bộ lọc tên của FindAssets tách từ theo khoảng trắng/ký tự đặc biệt nên có thể sót: so tên tệp mọi material.
                foreach (var g in AssetDatabase.FindAssets("t:Material"))
                {
                    var path = AssetDatabase.GUIDToAssetPath(g);
                    if (Path.GetFileNameWithoutExtension(path) == name) Consider(AssetDatabase.LoadAssetAtPath<Material>(path));
                    if (found != null) break;
                }
            }
            if (found == null)
            {
                // Material là sub-asset của font asset khác cùng atlas (FindAssets theo tên không luôn thấy sub-asset).
                foreach (var g in AssetDatabase.FindAssets("t:TMP_FontAsset"))
                {
                    foreach (var o in AssetDatabase.LoadAllAssetsAtPath(AssetDatabase.GUIDToAssetPath(g))) Consider(o as Material);
                    if (found != null) break;
                }
            }
            if (found == null && wrongAtlas != null)
                Warn(ctx.result, $"Material \"{name}\" ({AssetDatabase.GetAssetPath(wrongAtlas)}) không dùng atlas của font {font.name}, không gán được.");
            ctx.presetCache[(name, font)] = found;
            return found;
        }

        private static string F4(float v) => Math.Round(v, 4).ToString("0.####", CultureInfo.InvariantCulture);
        private static string C4(Color c) => F4(c.r) + "," + F4(c.g) + "," + F4(c.b) + "," + F4(c.a);

        /// <summary>Khoá tất định của bộ thông số (làm tròn 4 chữ số), dùng để đặt tên preset tự tạo.</summary>
        public static string MaterialParamsKey(LayoutText d)
        {
            var sb = new StringBuilder();
            sb.Append("dilate=").Append(F4(d.faceDilate));
            if (d.outline != null && d.outline.width > 0)
                sb.Append(";outline=").Append(F4(d.outline.width)).Append('|').Append(C4(d.outline.color));
            if (d.underlay != null)
                sb.Append(";underlay=").Append(C4(d.underlay.color)).Append('|').Append(F4(d.underlay.offsetX)).Append('|')
                  .Append(F4(d.underlay.offsetY)).Append('|').Append(F4(d.underlay.dilate)).Append('|').Append(F4(d.underlay.softness));
            return sb.ToString();
        }

        /// <summary>Tên asset preset tự tạo: "&lt;tên font asset&gt; ULS &lt;8 hex&gt;", hash FNV-1a từ GUID font + thông số.</summary>
        public static string GeneratedPresetName(TMP_FontAsset font, LayoutText d)
        {
            string guid = null;
            long localId = 0;
            if (!AssetDatabase.TryGetGUIDAndLocalFileIdentifier(font, out guid, out localId)) guid = font.name;
            var key = guid + ":" + localId.ToString(CultureInfo.InvariantCulture) + "|" + MaterialParamsKey(d);
            uint h = 2166136261;
            foreach (var b in Encoding.UTF8.GetBytes(key)) { h ^= b; h *= 16777619; }
            return UILayoutStudioSettings.SanitizeFileName(font.name) + " ULS " + h.ToString("x8");
        }

        private static Material GetOrCreateGeneratedPreset(TMP_FontAsset font, LayoutText d, string nodeName, BuildContext ctx)
        {
            if (font.material == null)
            {
                Warn(ctx.result, $"Node \"{nodeName}\": font {font.name} không có material mặc định, không tạo được preset viền/bóng.");
                return null;
            }
            var name = GeneratedPresetName(font, d);
            if (ctx.generatedCache.TryGetValue(name, out var cached) && cached != null) return cached;

            var folder = (string.IsNullOrWhiteSpace(ctx.settings.tmpMaterialFolder) ? UILayoutStudioSettings.DefaultTmpMaterialFolder
                : ctx.settings.tmpMaterialFolder.Trim()).Replace('\\', '/').TrimEnd('/');
            if (!folder.StartsWith("Assets"))
            {
                Warn(ctx.result, $"Thư mục material TMP phải nằm trong Assets/: {folder}. Dùng {UILayoutStudioSettings.DefaultTmpMaterialFolder}.");
                folder = UILayoutStudioSettings.DefaultTmpMaterialFolder;
            }
            var path = folder + "/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null && !UsableWithFont(mat, font))
            {
                // Atlas của font đã đổi (vd dựng lại font asset): trỏ lại atlas, giữ nguyên asset và GUID.
                mat.SetTexture("_MainTex", font.atlasTexture);
                EditorUtility.SetDirty(mat);
            }
            if (mat == null)
            {
                EnsureFolder(folder);
                mat = new Material(font.material) { name = name };
                SetMaterialParams(mat, d);
                AssetDatabase.CreateAsset(mat, path);
                Debug.Log(LogPrefix + $"Tạo material preset {path} ({MaterialParamsKey(d)}).");
            }
            ctx.generatedCache[name] = mat;
            return mat;
        }

        private static void SetMaterialParams(Material m, LayoutText d)
        {
            void SetF(string p, float v) { if (m.HasProperty(p)) m.SetFloat(p, v); }
            void SetC(string p, Color v) { if (m.HasProperty(p)) m.SetColor(p, v); }
            void Keyword(string k, bool on) { if (on) m.EnableKeyword(k); else m.DisableKeyword(k); }

            SetF("_FaceDilate", d.faceDilate);

            bool outline = d.outline != null && d.outline.width > 0;
            SetF("_OutlineWidth", outline ? d.outline.width : 0);
            if (outline) SetC("_OutlineColor", d.outline.color);
            Keyword(ShaderUtilities.Keyword_Outline, outline);

            bool underlay = d.underlay != null;
            if (underlay)
            {
                SetC("_UnderlayColor", d.underlay.color);
                SetF("_UnderlayOffsetX", d.underlay.offsetX);
                SetF("_UnderlayOffsetY", d.underlay.offsetY);
                SetF("_UnderlayDilate", d.underlay.dilate);
                SetF("_UnderlaySoftness", d.underlay.softness);
            }
            Keyword(ShaderUtilities.Keyword_Underlay, underlay);
            Keyword("UNDERLAY_INNER", false);

            // Tỉ lệ _ScaleRatioA/B/C để TMP tính padding đúng với viền/bóng.
            try { ShaderUtilities.UpdateShaderRatios(m); }
            catch (Exception e) { Debug.LogWarning(LogPrefix + "UpdateShaderRatios lỗi: " + e.Message); }
        }

        private static TMP_FontAsset DefaultTmpFont()
        {
            try { return TMP_Settings.defaultFontAsset; }
            catch { return null; } // project chưa import TMP Essential Resources
        }

        private static TMP_FontAsset ResolveFont(string logical, BuildContext ctx)
        {
            if (string.IsNullOrEmpty(logical)) return null;
            if (ctx.fontCache.TryGetValue(logical, out var cached)) return cached;
            TMP_FontAsset found = null;
            foreach (var m in ctx.settings.fonts)
                if (m != null && m.font != null && string.Equals(m.logicalName?.Trim(), logical, StringComparison.OrdinalIgnoreCase))
                {
                    found = m.font;
                    break;
                }
            if (found == null && ctx.settings.autoFindFontByName)
            {
                foreach (var g in AssetDatabase.FindAssets("t:TMP_FontAsset"))
                {
                    var path = AssetDatabase.GUIDToAssetPath(g);
                    var file = Path.GetFileNameWithoutExtension(path);
                    if (string.Equals(file, logical, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(file, logical + " SDF", StringComparison.OrdinalIgnoreCase))
                    {
                        found = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(path);
                        if (found != null)
                        {
                            Debug.Log(LogPrefix + $"Font \"{logical}\" chưa có trong bảng ánh xạ, tự dùng {path}.");
                            break;
                        }
                    }
                }
            }
            ctx.fontCache[logical] = found;
            return found;
        }

        // ---------------------------------------------------------------- Tiện ích

        private static void CheckUniqueIds(LayoutDocument doc)
        {
            var seen = new HashSet<string>();
            foreach (var (n, _) in doc.Walk())
                if (!seen.Add(n.id)) throw new FormatException($"layout.json có id trùng: \"{n.id}\".");
        }

        private static void Warn(ImportResult r, string msg)
        {
            r.warnings.Add(msg);
            Debug.LogWarning(LogPrefix + msg);
        }

        private static string NormalizeEntry(string name) => name.Replace('\\', '/').TrimStart('/');

        public static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, "..")).Replace('\\', '/');

        public static string ToFullPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            return Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(ProjectRoot, path)).Replace('\\', '/');
        }

        /// <summary>Đường dẫn để lưu: tương đối nếu nằm trong project, tuyệt đối nếu ngoài.</summary>
        public static string ToStoredPath(string fullPath)
        {
            var full = Path.GetFullPath(fullPath).Replace('\\', '/');
            var root = ProjectRoot.TrimEnd('/') + "/";
            return full.StartsWith(root, StringComparison.OrdinalIgnoreCase) ? full.Substring(root.Length) : full;
        }

        public static void EnsureFolder(string assetFolder)
        {
            if (string.IsNullOrEmpty(assetFolder) || AssetDatabase.IsValidFolder(assetFolder)) return;
            var parent = Path.GetDirectoryName(assetFolder)?.Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(assetFolder));
        }
    }
}
