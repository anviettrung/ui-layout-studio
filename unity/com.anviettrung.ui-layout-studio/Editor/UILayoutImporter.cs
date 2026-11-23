using System;
using System.Collections.Generic;
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

        private static bool IsImporterComponent(Component c, BuildContext ctx) =>
            c is Transform || c is CanvasRenderer || c is UILayoutNode || c is Image || c is TextMeshProUGUI ||
            (ctx.safeAreaType != null && ctx.safeAreaType.IsInstanceOfType(c));

        private static void ApplyNode(GameObject go, LayoutNodeData n, BuildContext ctx, bool isRoot)
        {
            var ln = go.GetComponent<UILayoutNode>() ?? go.AddComponent<UILayoutNode>();
            string prevType = ln.nodeType;
            if (go.name != n.name) go.name = n.name;

            var rt = go.GetComponent<RectTransform>() ?? go.AddComponent<RectTransform>();
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
                var r = n.rect;
                rt.anchorMin = r.anchorMin;
                rt.anchorMax = r.anchorMax;
                rt.pivot = r.pivot;
                rt.anchoredPosition = r.anchoredPosition;
                rt.sizeDelta = r.sizeDelta;
                rt.localEulerAngles = new Vector3(0, 0, r.rotation);
                rt.localScale = new Vector3(r.scale.x, r.scale.y, 1);
            }

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
            ln.nodeType = n.type;
            if (go.activeSelf != n.active) go.SetActive(n.active);
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
            img.type = d.type == "Sliced" ? Image.Type.Sliced : Image.Type.Simple;
            img.preserveAspect = d.preserveAspect;
            img.raycastTarget = d.raycastTarget;
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
