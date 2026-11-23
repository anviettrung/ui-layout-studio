// Phần kiểm chứng layout group / LayoutElement / ContentSizeFitter / Mask / Image Filled (layout mẫu thứ hai
// fixture/layout_groups.json). Sinh đáp án hình học bằng Unity: -ulsGenerateExpected (run.ps1 -GenerateExpected).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UILayoutStudio;
using UILayoutStudio.EditorTools;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace ULSVerify
{
    public static partial class ULSVerifyRunner
    {
        private const string LgExpectedFile = "layout_groups_expected.json";
        private static readonly Vector2[] LgCanvasSizes = { new Vector2(1080, 1920), new Vector2(1080, 2339), new Vector2(1440, 1920), new Vector2(1080, 2400) };

        private static Dictionary<string, byte[]> LgSprites() => new Dictionary<string, byte[]> { { "slice9.png", MakeSlicePng() } };

        // ------------------------------------------------------------ 7. Import layout_groups.json

        private static GameObject TestLayoutGroupImport(string json, string safeType)
        {
            Section("7. Layout group, LayoutElement, ContentSizeFitter, Mask, Image Filled: component và giá trị");
            var zip = MakeZip("layout_groups.uilayout.zip", json, LgSprites());
            var r = UILayoutImporter.Import(new ImportOptions
            {
                zipPath = zip,
                prefabPath = "Assets/UI/LayoutGroups/LayoutGroups.prefab",
                spriteFolder = "Assets/UI/LayoutGroups/Sprites",
                safeAreaComponentType = safeType,
            });
            Line("  " + r);
            foreach (var w in r.warnings) Line("    cảnh báo: " + w);
            Check(r.warnings.Count == 0, "không có cảnh báo");
            var ids = r.prefab.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => n.gameObject);
            Check(ids.Count == r.document.Walk().Count(), $"số node = {ids.Count} (file: {r.document.Walk().Count()})");

            // Đối chiếu chung: mọi node có đúng loại component theo file, giá trị file = giá trị component.
            var src = (Dictionary<string, object>)MiniJson.Parse(json);
            int nodeOk = 0, nodeTotal = 0;
            var bad = new List<string>();
            foreach (var (n, _) in r.document.Walk())
            {
                nodeTotal++;
                var go = ids[n.id];
                var raw = FindNode((Dictionary<string, object>)src["root"], n.id);
                var err = CompareComponents(go, raw);
                if (err == null) nodeOk++; else bad.Add(n.id + ": " + err);
            }
            foreach (var b in bad.Take(10)) Line("    " + b);
            Check(bad.Count == 0, $"component + giá trị khớp file trên {nodeOk}/{nodeTotal} node (layoutGroup, layoutElement, contentSizeFitter, mask, image.fill*)");

            // Vài kiểm tra cụ thể (dễ đọc trong báo cáo).
            var hA = ids["hA"].GetComponent<HorizontalLayoutGroup>();
            Check(hA != null && hA.padding.left == 10 && hA.padding.right == 20 && hA.padding.top == 5 && hA.padding.bottom == 15 && Approx(hA.spacing, 12) && hA.childAlignment == TextAnchor.MiddleCenter,
                "hA: HorizontalLayoutGroup padding RectOffset(10,20,5,15), spacing 12, MiddleCenter");
            var hE = ids["hE"].GetComponent<HorizontalLayoutGroup>();
            Check(hE != null && hE.childForceExpandWidth && hE.childForceExpandHeight && !hE.childControlWidth && !hE.childControlHeight && !hE.childScaleWidth && !hE.reverseArrangement
                  && Approx(hE.spacing, 0) && hE.padding.horizontal == 0 && hE.padding.vertical == 0 && hE.childAlignment == TextAnchor.UpperLeft,
                "hE: layoutGroup chỉ có type → mặc định Unity (forceExpand true, control false, spacing 0, UpperLeft)");
            var e1 = ids["e1"].GetComponent<LayoutElement>();
            Check(e1 != null && !e1.ignoreLayout && e1.minWidth == -1 && e1.minHeight == -1 && e1.preferredWidth == -1 && e1.preferredHeight == -1 && e1.flexibleWidth == -1 && e1.flexibleHeight == -1 && e1.layoutPriority == 1,
                "e1: layoutElement rỗng → LayoutElement mặc định (-1, layoutPriority 1)");
            var gB = ids["gB"].GetComponent<GridLayoutGroup>();
            Check(gB != null && gB.startCorner == GridLayoutGroup.Corner.LowerRight && gB.startAxis == GridLayoutGroup.Axis.Vertical && gB.constraint == GridLayoutGroup.Constraint.FixedColumnCount && gB.constraintCount == 3
                  && gB.cellSize == new Vector2(60, 50) && gB.spacing == new Vector2(4, 8) && gB.childAlignment == TextAnchor.MiddleCenter,
                "gB: GridLayoutGroup LowerRight, Vertical, FixedColumnCount 3, cell 60x50, spacing 4x8");
            var gF = ids["gF"].GetComponent<GridLayoutGroup>();
            Check(gF != null && gF.cellSize == new Vector2(100, 100) && gF.spacing == Vector2.zero && gF.constraint == GridLayoutGroup.Constraint.Flexible && gF.constraintCount == 2 && gF.startCorner == GridLayoutGroup.Corner.UpperLeft,
                "gF: Grid chỉ có type → mặc định (cell 100x100, Flexible, constraintCount 2)");
            var fitD = ids["fitD"].GetComponent<ContentSizeFitter>();
            Check(fitD != null && fitD.horizontalFit == ContentSizeFitter.FitMode.Unconstrained && fitD.verticalFit == ContentSizeFitter.FitMode.Unconstrained, "fitD: contentSizeFitter rỗng → Unconstrained");
            Check(ids["mask1"].GetComponent<Mask>() is Mask m1 && !m1.showMaskGraphic && ids["mask2"].GetComponent<Mask>() is Mask m2 && m2.showMaskGraphic,
                "mask1 Mask showMaskGraphic=false; mask2 không ghi showMaskGraphic → true");
            Check(ids["rmask"].GetComponent<RectMask2D>() != null && ids["vC"].GetComponent<RectMask2D>() != null && ids["rmask"].GetComponent<Mask>() == null, "rmask, vC: RectMask2D");
            var f1 = ids["fill1"].GetComponent<Image>();
            Check(f1.type == Image.Type.Filled && f1.fillMethod == Image.FillMethod.Radial360 && f1.fillOrigin == 2 && Approx(f1.fillAmount, 0.3f) && !f1.fillClockwise, "fill1: Filled Radial360, origin 2, 0.3, ngược chiều kim");
            var f4 = ids["fill4"].GetComponent<Image>();
            Check(f4.type == Image.Type.Filled && f4.fillMethod == Image.FillMethod.Radial360 && f4.fillOrigin == 0 && Approx(f4.fillAmount, 1) && f4.fillClockwise, "fill4: chỉ có type Filled → Radial360, 0, 1, clockwise");
            var hAln = ids["hA"].GetComponent<UILayoutNode>();
            Check(hAln.managedComponents.Contains(typeof(HorizontalLayoutGroup).FullName) && ids["vC"].GetComponent<UILayoutNode>().managedComponents.Count == 3,
                "UILayoutNode.managedComponents ghi component importer thêm (hA: " + string.Join(", ", hAln.managedComponents) + ")");
            var a1 = (RectTransform)ids["a1"].transform;
            Check(a1.anchorMin == new Vector2(0.5f, 0.5f) && a1.sizeDelta == new Vector2(100, 80) && a1.pivot == new Vector2(0.5f, 0.5f),
                "con của layout group: prefab giữ đúng rect trong file (a1 anchor 0.5, size 100x80)");
            return r.prefab;
        }

        /// <summary>So component trên GameObject với trường trong node JSON gốc. null = khớp.</summary>
        private static string CompareComponents(GameObject go, Dictionary<string, object> raw)
        {
            var lgRaw = raw.TryGetValue("layoutGroup", out var lgo) ? (Dictionary<string, object>)lgo : null;
            var groups = go.GetComponents<LayoutGroup>();
            if (lgRaw == null) { if (groups.Length > 0) return "có layout group thừa"; }
            else
            {
                if (groups.Length != 1) return $"cần 1 layout group, có {groups.Length}";
                var g = groups[0];
                string type = Str(lgRaw, "type", "Horizontal");
                Type want = type == "Vertical" ? typeof(VerticalLayoutGroup) : type == "Grid" ? typeof(GridLayoutGroup) : typeof(HorizontalLayoutGroup);
                if (g.GetType() != want) return $"layout group {g.GetType().Name}, cần {want.Name}";
                var pad = lgRaw.TryGetValue("padding", out var po) ? (Dictionary<string, object>)po : new Dictionary<string, object>();
                if (g.padding.left != (int)Num(pad, "left", 0) || g.padding.right != (int)Num(pad, "right", 0) || g.padding.top != (int)Num(pad, "top", 0) || g.padding.bottom != (int)Num(pad, "bottom", 0)) return "padding";
                if (g.childAlignment.ToString() != Str(lgRaw, "childAlignment", "UpperLeft")) return "childAlignment";
                if (g is HorizontalOrVerticalLayoutGroup hv)
                {
                    if (!Approx(hv.spacing, Num(lgRaw, "spacing", 0))) return "spacing";
                    if (hv.reverseArrangement != Bool(lgRaw, "reverseArrangement", false)) return "reverseArrangement";
                    if (hv.childControlWidth != Bool(lgRaw, "childControlWidth", false) || hv.childControlHeight != Bool(lgRaw, "childControlHeight", false)) return "childControl";
                    if (hv.childScaleWidth != Bool(lgRaw, "childScaleWidth", false) || hv.childScaleHeight != Bool(lgRaw, "childScaleHeight", false)) return "childScale";
                    if (hv.childForceExpandWidth != Bool(lgRaw, "childForceExpandWidth", true) || hv.childForceExpandHeight != Bool(lgRaw, "childForceExpandHeight", true)) return "childForceExpand";
                }
                else if (g is GridLayoutGroup gr)
                {
                    if (gr.cellSize != V2d(lgRaw, "cellSize", new Vector2(100, 100))) return "cellSize";
                    if (gr.spacing != V2d(lgRaw, "gridSpacing", Vector2.zero)) return "gridSpacing";
                    if (gr.startCorner.ToString() != Str(lgRaw, "startCorner", "UpperLeft")) return "startCorner";
                    if (gr.startAxis.ToString() != Str(lgRaw, "startAxis", "Horizontal")) return "startAxis";
                    if (gr.constraint.ToString() != Str(lgRaw, "constraint", "Flexible")) return "constraint";
                    if (gr.constraintCount != (int)Num(lgRaw, "constraintCount", 2)) return "constraintCount";
                }
            }

            var leRaw = raw.TryGetValue("layoutElement", out var leo) ? (Dictionary<string, object>)leo : null;
            var le = go.GetComponent<LayoutElement>();
            if (leRaw == null) { if (le != null) return "có LayoutElement thừa"; }
            else
            {
                if (le == null) return "thiếu LayoutElement";
                if (le.ignoreLayout != Bool(leRaw, "ignoreLayout", false)) return "ignoreLayout";
                if (!Approx(le.minWidth, Num(leRaw, "minWidth", -1)) || !Approx(le.minHeight, Num(leRaw, "minHeight", -1)) ||
                    !Approx(le.preferredWidth, Num(leRaw, "preferredWidth", -1)) || !Approx(le.preferredHeight, Num(leRaw, "preferredHeight", -1)) ||
                    !Approx(le.flexibleWidth, Num(leRaw, "flexibleWidth", -1)) || !Approx(le.flexibleHeight, Num(leRaw, "flexibleHeight", -1))) return "min/preferred/flexible";
                if (le.layoutPriority != (int)Num(leRaw, "layoutPriority", 1)) return "layoutPriority";
            }

            var cfRaw = raw.TryGetValue("contentSizeFitter", out var cfo) ? (Dictionary<string, object>)cfo : null;
            var cf = go.GetComponent<ContentSizeFitter>();
            if (cfRaw == null) { if (cf != null) return "có ContentSizeFitter thừa"; }
            else
            {
                if (cf == null) return "thiếu ContentSizeFitter";
                if (cf.horizontalFit.ToString() != Str(cfRaw, "horizontalFit", "Unconstrained") || cf.verticalFit.ToString() != Str(cfRaw, "verticalFit", "Unconstrained")) return "FitMode";
            }

            var mRaw = raw.TryGetValue("mask", out var mo) ? (Dictionary<string, object>)mo : null;
            var mask = go.GetComponent<Mask>();
            var rm = go.GetComponent<RectMask2D>();
            if (mRaw == null) { if (mask != null || rm != null) return "có mask thừa"; }
            else if (Str(mRaw, "type", "Mask") == "Mask")
            {
                if (mask == null || rm != null) return "cần Mask";
                if (mask.showMaskGraphic != Bool(mRaw, "showMaskGraphic", true)) return "showMaskGraphic";
            }
            else if (rm == null || mask != null) return "cần RectMask2D";

            if (raw.TryGetValue("image", out var io) && io is Dictionary<string, object> im)
            {
                var img = go.GetComponent<Image>();
                string t = Str(im, "type", "Simple");
                if (img.type.ToString() != t) return "Image.type " + img.type;
                if (t == "Filled")
                {
                    if (img.fillMethod.ToString() != Str(im, "fillMethod", "Radial360")) return "fillMethod";
                    if (img.fillOrigin != (int)Num(im, "fillOrigin", 0)) return "fillOrigin";
                    if (!Approx(img.fillAmount, Num(im, "fillAmount", 1))) return "fillAmount";
                    if (img.fillClockwise != Bool(im, "fillClockwise", true)) return "fillClockwise";
                }
            }
            return null;
        }

        // ------------------------------------------------------------ 8. Hình học layout group (đáp án do Unity sinh)

        private static void TestLayoutGroupGeometry(GameObject prefab, string fixtureDir, bool generate)
        {
            Section("8. Hình học layout group: LayoutRebuilder + Canvas.ForceUpdateCanvases ở 4 kích thước canvas");
            var expectedPath = Path.Combine(fixtureDir, LgExpectedFile);
            var results = new List<(Vector2 size, Dictionary<string, Vector3[]> nodes)>();
            foreach (var cs in LgCanvasSizes)
            {
                var m = MeasureLayout(prefab, cs, out int passes, out double firstPassDiff);
                var again = MeasureLayout(prefab, cs, out _, out _);
                double rerun = MaxDiff(m, again);
                Line($"  canvas {cs.x}x{cs.y}: {m.Count} node, ổn định sau {passes} lượt rebuild, lượt 1 lệch kết quả cuối {firstPassDiff:0.######}, đo lại lệch {rerun:0.######}");
                Check(rerun < 1e-4, $"  {cs.x}x{cs.y}: đo hai lần ra cùng kết quả");
                results.Add((cs, m));
            }

            if (generate)
            {
                File.WriteAllText(expectedPath, LgExpectedJson(results), new UTF8Encoding(false));
                Line("  Đã ghi đáp án: " + Path.GetFullPath(expectedPath));
            }
            if (!File.Exists(expectedPath)) { Fail("thiếu " + expectedPath + " (chạy run.ps1 -GenerateExpected)"); return; }

            var expected = (List<object>)MiniJson.Parse(File.ReadAllText(expectedPath));
            Check(expected.Count == results.Count, $"{LgExpectedFile} có {expected.Count} case");
            for (int i = 0; i < Math.Min(expected.Count, results.Count); i++)
            {
                var c = (Dictionary<string, object>)expected[i];
                var cs = V2(c["canvasSize"]);
                var nodes = (Dictionary<string, object>)c["nodes"];
                var got = results.FirstOrDefault(x => x.size == cs).nodes;
                if (got == null) { Fail($"case {i}: không có canvas {cs}"); continue; }
                double worst = 0;
                string worstNode = "";
                int missing = 0;
                foreach (var kv in nodes)
                {
                    if (!got.TryGetValue(kv.Key, out var corners)) { missing++; continue; }
                    var exp = (List<object>)kv.Value;
                    for (int k = 0; k < 4; k++)
                    {
                        var p = (List<object>)exp[k];
                        double d = Math.Max(Math.Abs(corners[k].x - (double)p[0]), Math.Abs(corners[k].y - (double)p[1]));
                        if (d > worst) { worst = d; worstNode = kv.Key; }
                    }
                }
                Check(missing == 0 && nodes.Count == got.Count && worst <= Tol,
                    $"  {cs.x}x{cs.y}: {nodes.Count} node khớp đáp án, lệch max {worst:0.######}" + (worst > Tol ? " (" + worstNode + ")" : "") + (missing > 0 ? $", thiếu {missing}" : ""));
            }
        }

        /// <summary>
        /// Dựng prefab trong Canvas world space kích thước <paramref name="canvasSize"/> (gốc dưới trái ở (0,0), scale 1),
        /// rebuild layout như CanvasUpdateRegistry (mỗi layout root một lần, root nông trước), Canvas.ForceUpdateCanvases,
        /// lặp tới khi ổn định. Trả về 4 góc world (BL, TL, TR, BR) của mọi node.
        /// </summary>
        private static Dictionary<string, Vector3[]> MeasureLayout(GameObject prefab, Vector2 canvasSize, out int passes, out double firstPassDiff)
        {
            var host = new GameObject("LGCanvas", typeof(RectTransform));
            try
            {
                var cv = host.AddComponent<Canvas>();
                cv.renderMode = RenderMode.WorldSpace;
                var hrt = (RectTransform)host.transform;
                hrt.anchorMin = hrt.anchorMax = hrt.pivot = Vector2.zero;
                hrt.sizeDelta = canvasSize;
                hrt.position = Vector3.zero;
                hrt.localScale = Vector3.one;
                hrt.rotation = Quaternion.identity;
                var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                inst.transform.SetParent(host.transform, false);
                var map = inst.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => (RectTransform)n.transform);

                Dictionary<string, Vector3[]> first = null, prev = null, cur = null;
                passes = 0;
                for (int i = 0; i < 8; i++)
                {
                    RebuildLayoutRoots(inst);
                    Canvas.ForceUpdateCanvases();
                    cur = Snapshot(map);
                    passes = i + 1;
                    if (first == null) first = cur;
                    if (prev != null && MaxDiff(prev, cur) < 1e-5) break;
                    prev = cur;
                }
                firstPassDiff = MaxDiff(first, cur);
                return cur;
            }
            finally { Object.DestroyImmediate(host); }
        }

        private static void RebuildLayoutRoots(GameObject inst)
        {
            bool IsActiveGroup(Transform t) => t != null && t.GetComponents<LayoutGroup>().Any(g => g.isActiveAndEnabled);
            var roots = new HashSet<RectTransform>();
            foreach (var c in inst.GetComponentsInChildren<Behaviour>(false))
            {
                if (!(c is ILayoutController) || !c.isActiveAndEnabled) continue;
                var t = (RectTransform)c.transform;
                while (IsActiveGroup(t.parent)) t = (RectTransform)t.parent;
                roots.Add(t);
            }
            foreach (var r in roots.OrderBy(Depth)) LayoutRebuilder.ForceRebuildLayoutImmediate(r);
        }

        private static int Depth(Transform t)
        {
            int d = 0;
            for (; t.parent != null; t = t.parent) d++;
            return d;
        }

        private static Dictionary<string, Vector3[]> Snapshot(Dictionary<string, RectTransform> map)
        {
            var o = new Dictionary<string, Vector3[]>();
            foreach (var kv in map)
            {
                var c = new Vector3[4];
                kv.Value.GetWorldCorners(c);
                o[kv.Key] = c;
            }
            return o;
        }

        private static double MaxDiff(Dictionary<string, Vector3[]> a, Dictionary<string, Vector3[]> b)
        {
            double m = 0;
            foreach (var kv in a)
            {
                if (!b.TryGetValue(kv.Key, out var o)) return double.PositiveInfinity;
                for (int k = 0; k < 4; k++) m = Math.Max(m, Math.Max(Math.Abs(kv.Value[k].x - o[k].x), Math.Abs(kv.Value[k].y - o[k].y)));
            }
            return m;
        }

        private static string LgExpectedJson(List<(Vector2 size, Dictionary<string, Vector3[]> nodes)> results)
        {
            string N(float f) => Math.Abs(f) < 5e-6f ? "0" : f.ToString("R", CultureInfo.InvariantCulture);
            var sb = new StringBuilder();
            sb.Append("[\n");
            for (int i = 0; i < results.Count; i++)
            {
                var (size, nodes) = results[i];
                sb.Append("  {\n    \"canvasSize\": { \"x\": ").Append(N(size.x)).Append(", \"y\": ").Append(N(size.y)).Append(" },\n    \"nodes\": {\n");
                int j = 0;
                foreach (var kv in nodes.OrderBy(k => k.Key, StringComparer.Ordinal))
                {
                    sb.Append("      \"").Append(kv.Key).Append("\": [");
                    for (int k = 0; k < 4; k++)
                    {
                        if (k > 0) sb.Append(", ");
                        sb.Append('[').Append(N(kv.Value[k].x)).Append(", ").Append(N(kv.Value[k].y)).Append(']');
                    }
                    sb.Append(']').Append(++j < nodes.Count ? ",\n" : "\n");
                }
                sb.Append("    }\n  }").Append(i < results.Count - 1 ? ",\n" : "\n");
            }
            sb.Append("]\n");
            return sb.ToString();
        }

        // ------------------------------------------------------------ 9. Import lại giữ component dev

        private static void TestLayoutGroupReimport(string json, string safeType)
        {
            Section("9. Import lại: chỉ gỡ component importer đã thêm, giữ component dev");
            const string prefabPath = "Assets/UI/LGReimport/LGReimport.prefab";
            var zip = MakeZip("lg_reimport.uilayout.zip", json, LgSprites());
            UILayoutImporter.Import(new ImportOptions { zipPath = zip, prefabPath = prefabPath, spriteFolder = "Assets/UI/LGReimport/Sprites", safeAreaComponentType = safeType });

            // Dev sửa prefab.
            var contents = PrefabUtility.LoadPrefabContents(prefabPath);
            var byId = contents.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => n.gameObject);
            byId["a1"].AddComponent<LayoutElement>().preferredWidth = 77;          // node không có layoutElement trong file
            byId["rmask"].AddComponent<VerticalLayoutGroup>().spacing = 33;         // node không có layoutGroup
            byId["fill1"].AddComponent<RectMask2D>();                               // node không có mask
            byId["fitD"].AddComponent<HorizontalLayoutGroup>().spacing = 5;         // file sẽ thêm layoutGroup Horizontal cho node này
            byId["b3"].GetComponent<LayoutElement>().minWidth = 999;                // sửa component importer quản lý: bị ghi đè
            PrefabUtility.SaveAsPrefabAsset(contents, prefabPath);
            PrefabUtility.UnloadPrefabContents(contents);

            // Artist sửa layout.
            var doc = (Dictionary<string, object>)MiniJson.Parse(json);
            var root = (Dictionary<string, object>)doc["root"];
            FindNode(root, "hA").Remove("layoutGroup");
            ((Dictionary<string, object>)FindNode(root, "vA")["layoutGroup"])["type"] = "Grid";
            FindNode(root, "b3").Remove("layoutElement");
            FindNode(root, "mask1").Remove("mask");
            ((Dictionary<string, object>)FindNode(root, "mask2")["mask"])["type"] = "RectMask2D";
            FindNode(root, "vC").Remove("contentSizeFitter");
            FindNode(root, "fitD")["layoutGroup"] = MiniJson.Parse("{\"type\":\"Horizontal\",\"spacing\":21}");
            FindNode(root, "c3")["mask"] = MiniJson.Parse("{\"type\":\"Mask\"}"); // Group: không có Image
            MakeZip("lg_reimport.uilayout.zip", ToJson(doc), LgSprites());

            var r2 = UILayoutImporter.Reimport(AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath));
            Line("  " + r2);
            var p = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            var ids = p.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => n.gameObject);
            Check(ids["a1"].GetComponent<LayoutElement>() is LayoutElement le && Approx(le.preferredWidth, 77), "LayoutElement dev thêm trên a1 còn nguyên (preferredWidth 77)");
            Check(ids["rmask"].GetComponent<VerticalLayoutGroup>() is VerticalLayoutGroup v && Approx(v.spacing, 33), "VerticalLayoutGroup dev thêm trên rmask còn nguyên");
            Check(ids["fill1"].GetComponent<RectMask2D>() != null, "RectMask2D dev thêm trên fill1 còn nguyên");
            Check(ids["hA"].GetComponent<LayoutGroup>() == null && !ids["hA"].GetComponent<UILayoutNode>().managedComponents.Any(), "hA: file bỏ layoutGroup → gỡ HorizontalLayoutGroup importer đã thêm");
            Check(ids["vA"].GetComponent<GridLayoutGroup>() != null && ids["vA"].GetComponent<VerticalLayoutGroup>() == null
                  && ids["vA"].GetComponent<UILayoutNode>().managedComponents.SequenceEqual(new[] { typeof(GridLayoutGroup).FullName }), "vA: Vertical → Grid, thay component, managedComponents cập nhật");
            Check(ids["b3"].GetComponent<LayoutElement>() == null, "b3: file bỏ layoutElement → gỡ LayoutElement (kể cả khi dev đã sửa giá trị)");
            Check(ids["b9"].GetComponent<LayoutElement>() is LayoutElement b9 && Approx(b9.preferredWidth, 10), "b9: LayoutElement vẫn còn theo file");
            Check(ids["mask1"].GetComponent<Mask>() == null && ids["mask1"].GetComponent<Image>() != null, "mask1: file bỏ mask → gỡ Mask, Image giữ");
            Check(ids["mask2"].GetComponent<Mask>() == null && ids["mask2"].GetComponent<RectMask2D>() != null, "mask2: Mask → RectMask2D");
            Check(ids["vC"].GetComponent<ContentSizeFitter>() == null && ids["vC"].GetComponent<RectMask2D>() != null && ids["vC"].GetComponent<VerticalLayoutGroup>() != null, "vC: gỡ ContentSizeFitter, giữ RectMask2D + VerticalLayoutGroup");
            var fitD = ids["fitD"];
            Check(fitD.GetComponents<HorizontalLayoutGroup>().Length == 1 && Approx(fitD.GetComponent<HorizontalLayoutGroup>().spacing, 21)
                  && !fitD.GetComponent<UILayoutNode>().managedComponents.Contains(typeof(HorizontalLayoutGroup).FullName),
                "fitD: HorizontalLayoutGroup dev có sẵn được dùng lại, gán theo file (spacing 21), vẫn tính là của dev");
            Check(ids["c3"].GetComponent<Mask>() != null && r2.warnings.Any(w => w.Contains("\"c3\"") && w.Contains("Mask")), "c3: Mask trên Group → vẫn thêm, có cảnh báo thiếu Image");

            // Lần 3: file bỏ layoutGroup của fitD → component của dev được giữ. Import lại không đổi gì khác.
            FindNode(root, "fitD").Remove("layoutGroup");
            MakeZip("lg_reimport.uilayout.zip", ToJson(doc), LgSprites());
            int CountComps(GameObject g) => g.GetComponentsInChildren<Component>(true).Length;
            int before = CountComps(p);
            var r3 = UILayoutImporter.Reimport(p);
            p = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            ids = p.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => n.gameObject);
            Check(ids["fitD"].GetComponent<HorizontalLayoutGroup>() != null, "fitD: file bỏ layoutGroup → HorizontalLayoutGroup của dev được giữ");
            Check(r3.created == 0 && r3.deleted == 0 && CountComps(p) == before, $"import lần 3: không tạo/xoá node, số component giữ nguyên ({before})");
        }

        // ------------------------------------------------------------ Tiện ích

        private static string Str(Dictionary<string, object> o, string k, string def) => o.TryGetValue(k, out var v) && v is string s ? s : def;
        private static float Num(Dictionary<string, object> o, string k, float def) => o.TryGetValue(k, out var v) && v is double d ? (float)d : def;
        private static bool Bool(Dictionary<string, object> o, string k, bool def) => o.TryGetValue(k, out var v) && v is bool b ? b : def;
        private static Vector2 V2d(Dictionary<string, object> o, string k, Vector2 def) =>
            o.TryGetValue(k, out var v) && v is Dictionary<string, object> d ? new Vector2(Num(d, "x", def.x), Num(d, "y", def.y)) : def;
    }
}
