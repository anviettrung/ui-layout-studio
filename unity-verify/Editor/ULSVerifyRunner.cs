// Kiểm chứng importer UI Layout Studio bằng Unity thật. Chạy batchmode:
//   Unity.exe -batchmode -nographics -projectPath <proj> -executeMethod ULSVerify.ULSVerifyRunner.Run
//             -ulsFixture <thư mục chứa layout.json + expected.json> -ulsReport <tệp báo cáo>
// Thoát mã 0 nếu mọi kiểm tra PASS, 1 nếu có lỗi. Xem unity-verify/README.md.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using TMPro;
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
        private const float Tol = 0.01f;
        private const string WorkDir = "VerifyData"; // trong thư mục project (ngoài Assets)
        private static readonly StringBuilder Report = new StringBuilder();
        private static int failures;
        private static int checks;

        // ------------------------------------------------------------ Lệnh

        /// <summary>Bước chuẩn bị: import TMP Essential Resources nếu project chưa có.</summary>
        public static void Setup()
        {
            int code = 0;
            try
            {
                if (Resources.Load<TMP_Settings>("TMP Settings") == null)
                {
                    var pkg = UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(TMP_Text).Assembly);
                    var path = Path.Combine(pkg.resolvedPath, "Package Resources", "TMP Essential Resources.unitypackage");
                    Debug.Log("[ULS] Import " + path);
                    // ImportPackage chạy bất đồng bộ: chờ callback rồi mới thoát (không truyền -quit).
                    AssetDatabase.importPackageCompleted += _ => { AssetDatabase.Refresh(); Debug.Log("[ULS] Đã import TMP Essential Resources."); EditorApplication.Exit(0); };
                    AssetDatabase.importPackageFailed += (_, err) => { Debug.LogError("[ULS] Import TMP lỗi: " + err); EditorApplication.Exit(1); };
                    AssetDatabase.ImportPackage(path, false);
                    return;
                }
                else Debug.Log("[ULS] Đã có TMP Settings.");
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                code = 1;
            }
            EditorApplication.Exit(code);
        }

        public static void Run()
        {
            string fixtureDir = Arg("-ulsFixture");
            string reportPath = Arg("-ulsReport");
            try
            {
                if (string.IsNullOrEmpty(fixtureDir)) throw new ArgumentException("Thiếu -ulsFixture <thư mục>");
                Directory.CreateDirectory(WorkDir);
                Line($"UI Layout Studio — kiểm chứng Unity {Application.unityVersion}, {DateTime.Now:s}");
                Line("");

                var layoutJson = File.ReadAllText(Path.Combine(fixtureDir, "layout.json"));
                var expected = (List<object>)MiniJson.Parse(File.ReadAllText(Path.Combine(fixtureDir, "expected.json")));

                var notchType = UILayoutImporter.FindComponentType(UILayoutStudioSettings.DefaultSafeAreaType);
                string safeType = notchType != null ? UILayoutStudioSettings.DefaultSafeAreaType : typeof(FakeSafePadding).FullName;
                Line($"Component safe area: {safeType}" + (notchType != null ? " (NotchSolution thật, chép từ dự án)" : " (giả lập, project không có NotchSolution)"));

                var prefab = TestImportFixture(layoutJson, safeType);
                TestGeometry(prefab, expected, simulateWithSafePadding: false);
                if (notchType != null) TestGeometry(prefab, expected, simulateWithSafePadding: true);
                TestCanvasScaler(expected);
                TestReimport(layoutJson, safeType);
                TestSlicedSpriteAndText(safeType);
                TestVersionReject(layoutJson);

                var lgJson = File.ReadAllText(Path.Combine(fixtureDir, "layout_groups.json"));
                var lgPrefab = TestLayoutGroupImport(lgJson, safeType);
                TestLayoutGroupGeometry(lgPrefab, fixtureDir, HasArg("-ulsGenerateExpected"));
                TestLayoutGroupReimport(lgJson, safeType);
            }
            catch (Exception e)
            {
                Fail("Ngoại lệ: " + e);
            }

            Line("");
            Line(failures == 0 ? $"KẾT QUẢ: PASS ({checks} kiểm tra)" : $"KẾT QUẢ: FAIL ({failures}/{checks} kiểm tra lỗi)");
            if (!string.IsNullOrEmpty(reportPath)) File.WriteAllText(reportPath, Report.ToString(), new UTF8Encoding(false));
            Debug.Log("[ULS]\n" + Report);
            EditorApplication.Exit(failures == 0 ? 0 : 1);
        }

        // ------------------------------------------------------------ 1. Import fixture

        private static GameObject TestImportFixture(string layoutJson, string safeType)
        {
            Section("1. Import fixture");
            var zip = MakeZip("fixture.uilayout.zip", layoutJson, null);
            var r = UILayoutImporter.Import(new ImportOptions
            {
                zipPath = zip,
                prefabPath = "Assets/UI/Fixture/Fixture.prefab",
                spriteFolder = "Assets/UI/Fixture/Sprites",
                safeAreaComponentType = safeType,
            });
            Line("  " + r);
            Check(r.prefab != null, "prefab được tạo");
            var nodes = r.prefab.GetComponentsInChildren<UILayoutNode>(true);
            Check(nodes.Length == r.document.Walk().Count(), $"số node = {nodes.Length} (file: {r.document.Walk().Count()})");
            var safe = nodes.First(n => n.nodeId == "safe");
            Check(safe.GetComponent(UILayoutImporter.FindComponentType(safeType)) != null, "node SafeArea có component " + safeType);
            var play = nodes.First(n => n.nodeId == "playBtn").GetComponent<RectTransform>();
            Check(Approx(play.localEulerAngles.z, 15) && Approx(play.localScale.x, 1.2f) && Approx(play.localScale.y, 0.9f) && Approx(play.localScale.z, 1),
                $"playBtn rotation/scale = {play.localEulerAngles.z}, {play.localScale}");
            var gold = nodes.First(n => n.nodeId == "gold").GetComponent<TextMeshProUGUI>();
            Check(gold != null && gold.text == "Text" && Approx(gold.fontSize, 48), "gold là TextMeshProUGUI, text/fontSize đúng");
            Check(gold != null && gold.margin == Vector4.zero, "gold: không có text.margin → TMP margin = Vector4.zero");
            var bg = nodes.First(n => n.nodeId == "bg").GetComponent<Image>();
            Check(bg != null && bg.sprite == null && bg.color == Color.white, "bg là Image ô màu (sprite null)");
            // Thứ tự sibling theo file.
            var root = r.prefab.transform;
            Check(root.GetChild(0).name == "bg" && root.GetChild(1).name == "deco" && root.GetChild(2).name == "SafeArea", "thứ tự sibling dưới root: bg, deco, SafeArea");
            return r.prefab;
        }

        // ------------------------------------------------------------ 2. Hình học 32 case

        private static void TestGeometry(GameObject prefab, List<object> cases, bool simulateWithSafePadding)
        {
            Section(simulateWithSafePadding
                ? "2b. Vị trí 4 góc, SafeArea do SafePadding thật tính (NotchSimulator truyền safe area tương đối)"
                : "2a. Vị trí 4 góc, SafeArea đặt offset theo expected.safe (giả lập SafePadding)");
            Line($"  {"#",-3}{"máy",-13}{"chế độ",-26}{"scale",-10}{"canvas",-22}{"node",-6}{"lệch max",-12}kết quả");
            double worst = 0;
            int pass = 0;
            for (int ci = 0; ci < cases.Count; ci++)
            {
                var c = (Dictionary<string, object>)cases[ci];
                var canvas = (Dictionary<string, object>)c["canvas"];
                var cs = V2(c["canvasSize"]);
                var safe = (Dictionary<string, object>)c["safe"];
                var nodes = (Dictionary<string, object>)c["nodes"];

                var host = new GameObject("TestCanvas", typeof(RectTransform));
                var hrt = (RectTransform)host.transform;
                if (simulateWithSafePadding)
                {
                    var cv = host.AddComponent<Canvas>();
                    cv.renderMode = RenderMode.WorldSpace; // để tự đặt kích thước canvas
                }
                hrt.anchorMin = hrt.anchorMax = hrt.pivot = Vector2.zero;
                hrt.sizeDelta = cs;
                hrt.position = Vector3.zero;
                hrt.localScale = Vector3.one;
                hrt.rotation = Quaternion.identity;

                var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                inst.transform.SetParent(host.transform, false);
                var map = inst.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => (RectTransform)n.transform);

                float sx = F(safe["x"]), sy = F(safe["y"]), sw = F(safe["width"]), sh = F(safe["height"]);
                var safeRt = map["safe"];
                if (!simulateWithSafePadding)
                {
                    foreach (var comp in safeRt.GetComponents<MonoBehaviour>())
                        if (!(comp is UILayoutNode)) Object.DestroyImmediate(comp);
                    safeRt.offsetMin = new Vector2(sx, sy);
                    safeRt.offsetMax = new Vector2(sx + sw - cs.x, sy + sh - cs.y);
                }
                else
                {
                    var target = safeRt.GetComponents<MonoBehaviour>().FirstOrDefault(m => m.GetType().GetInterface("E7.NotchSolution.INotchSimulatorTarget") != null);
                    if (target == null) throw new Exception("Component safe area không phải INotchSimulatorTarget");
                    var mi = target.GetType().GetInterface("E7.NotchSolution.INotchSimulatorTarget").GetMethod("SimulatorUpdate");
                    mi.Invoke(target, new object[] { new Rect(sx / cs.x, sy / cs.y, sw / cs.x, sh / cs.y), new Rect[0] });
                }
                Canvas.ForceUpdateCanvases();

                double caseMax = 0;
                var corners = new Vector3[4];
                string worstNode = "";
                foreach (var kv in nodes)
                {
                    if (!map.TryGetValue(kv.Key, out var rt)) { Fail($"case {ci}: thiếu node {kv.Key}"); continue; }
                    rt.GetWorldCorners(corners);
                    var exp = (List<object>)kv.Value;
                    for (int k = 0; k < 4; k++)
                    {
                        var p = (List<object>)exp[k];
                        double dx = Math.Abs(corners[k].x - (double)p[0]);
                        double dy = Math.Abs(corners[k].y - (double)p[1]);
                        double d = Math.Max(dx, dy);
                        if (d > caseMax) { caseMax = d; worstNode = kv.Key; }
                    }
                }
                bool ok = caseMax <= Tol;
                checks++;
                if (ok) pass++; else failures++;
                worst = Math.Max(worst, caseMax);
                string mode = (string)canvas["screenMatchMode"] + ((string)canvas["screenMatchMode"] == "MatchWidthOrHeight" ? " m=" + F(canvas["match"]).ToString("0.##", CultureInfo.InvariantCulture) : "");
                Line($"  {ci,-3}{(string)c["device"],-13}{mode,-26}{F(c["scale"]),-10:0.#####}{cs.x.ToString("0.##", CultureInfo.InvariantCulture) + "x" + cs.y.ToString("0.##", CultureInfo.InvariantCulture),-22}{nodes.Count,-6}{caseMax,-12:0.######}{(ok ? "PASS" : "FAIL (" + worstNode + ")")}");
                Object.DestroyImmediate(host);
            }
            Line($"  => {pass}/{cases.Count} case PASS, sai số lớn nhất {worst:0.########} (cho phép {Tol})");
        }

        // ------------------------------------------------------------ 3. CanvasScaler

        private static void TestCanvasScaler(List<object> cases)
        {
            Section("3. CanvasScaler");
            // 3a. Bản chép nguyên văn HandleScaleWithScreenSize (Mathf, float) so với scale trong expected.json (JS).
            double worst = 0;
            foreach (Dictionary<string, object> c in cases)
            {
                var canvas = (Dictionary<string, object>)c["canvas"];
                var screen = (Dictionary<string, object>)c["screen"];
                var refRes = V2(canvas["referenceResolution"]);
                float s = UnitySourceScale(new Vector2(F(screen["w"]), F(screen["h"])), refRes, (string)canvas["screenMatchMode"], F(canvas["match"]));
                worst = Math.Max(worst, Math.Abs(s - (double)c["scale"]));
            }
            Check(worst < 1e-5, $"3a. công thức chép từ CanvasScaler.cs (float) vs scale JS trong expected.json: lệch max {worst:0.##E+0} trên {cases.Count} case");

            // 3b. CanvasScaler thật ở kích thước màn hình batchmode.
            var go = new GameObject("ScalerTest", typeof(RectTransform));
            var cv = go.AddComponent<Canvas>();
            cv.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            var handle = typeof(CanvasScaler).GetMethod("Handle", BindingFlags.Instance | BindingFlags.NonPublic);
            var disp = cv.renderingDisplaySize;
            Line($"  3b. Canvas.renderingDisplaySize trong batchmode = {disp}");
            if (disp.x <= 0 || disp.y <= 0) Line("      (bằng 0: bỏ qua so sánh CanvasScaler thật)");
            else
            {
                var modes = new (CanvasScaler.ScreenMatchMode mode, float match, string name)[]
                {
                    (CanvasScaler.ScreenMatchMode.Expand, 1, "Expand"),
                    (CanvasScaler.ScreenMatchMode.Shrink, 1, "Shrink"),
                    (CanvasScaler.ScreenMatchMode.MatchWidthOrHeight, 0, "MatchWidthOrHeight"),
                    (CanvasScaler.ScreenMatchMode.MatchWidthOrHeight, 0.5f, "MatchWidthOrHeight"),
                    (CanvasScaler.ScreenMatchMode.MatchWidthOrHeight, 1, "MatchWidthOrHeight"),
                };
                foreach (var m in modes)
                {
                    scaler.screenMatchMode = m.mode;
                    scaler.matchWidthOrHeight = m.match;
                    handle.Invoke(scaler, null);
                    double js = JsScale(disp.x, disp.y, 1080, 1920, m.name, m.match);
                    Check(Math.Abs(cv.scaleFactor - js) < 1e-5, $"      {m.name} m={m.match}: Canvas.scaleFactor = {cv.scaleFactor:0.######}, công thức JS = {js:0.######}");
                }
            }
            Object.DestroyImmediate(go);
        }

        /// <summary>Chép nguyên văn từ CanvasScaler.HandleScaleWithScreenSize (com.unity.ugui 2.0.0).</summary>
        private static float UnitySourceScale(Vector2 screenSize, Vector2 refRes, string mode, float match)
        {
            const float kLogBase = 2;
            switch (mode)
            {
                case "MatchWidthOrHeight":
                    float logWidth = Mathf.Log(screenSize.x / refRes.x, kLogBase);
                    float logHeight = Mathf.Log(screenSize.y / refRes.y, kLogBase);
                    float logWeightedAverage = Mathf.Lerp(logWidth, logHeight, match);
                    return Mathf.Pow(kLogBase, logWeightedAverage);
                case "Expand": return Mathf.Min(screenSize.x / refRes.x, screenSize.y / refRes.y);
                case "Shrink": return Mathf.Max(screenSize.x / refRes.x, screenSize.y / refRes.y);
            }
            return 0;
        }

        /// <summary>Bản C# (double) của canvasScaleFactor trong src/model/layout.ts.</summary>
        private static double JsScale(double w, double h, double rw, double rh, string mode, double match)
        {
            switch (mode)
            {
                case "Expand": return Math.Min(w / rw, h / rh);
                case "Shrink": return Math.Max(w / rw, h / rh);
                default:
                    double lw = Math.Log(w / rw, 2), lh = Math.Log(h / rh, 2);
                    double m = Math.Min(1, Math.Max(0, match));
                    return Math.Pow(2, lw + (lh - lw) * m);
            }
        }

        // ------------------------------------------------------------ 4. Import lại

        private static void TestReimport(string layoutJson, string safeType)
        {
            Section("4. Import lại giữ việc của dev");
            const string prefabPath = "Assets/UI/Reimport/Reimport.prefab";
            var zip = MakeZip("reimport.uilayout.zip", layoutJson, null);
            var r1 = UILayoutImporter.Import(new ImportOptions { zipPath = zip, prefabPath = prefabPath, spriteFolder = "Assets/UI/Reimport/Sprites", safeAreaComponentType = safeType });

            // Dev sửa prefab: thêm GameObject, thêm component, đổi giá trị không có trong file.
            var contents = PrefabUtility.LoadPrefabContents(prefabPath);
            var byId = contents.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => n.gameObject);
            var devBadge = new GameObject("DevBadge", typeof(RectTransform));
            devBadge.transform.SetParent(byId["topBar"].transform, false);
            devBadge.AddComponent<DevMarker>().note = "badge";
            var devChild = new GameObject("DevChildOfTab2", typeof(RectTransform));
            devChild.transform.SetParent(byId["tab2"].transform, false);
            ((RectTransform)devChild.transform).anchoredPosition = new Vector2(3, 4);
            byId["avatar"].AddComponent<DevMarker>().note = "avatar-dev";
            byId["avatar"].GetComponent<Image>().pixelsPerUnitMultiplier = 2.5f; // thuộc tính không có trong file
            contents.AddComponent<CanvasGroup>().alpha = 0.5f;
            var devTop = new GameObject("DevPopupLayer", typeof(RectTransform));
            devTop.transform.SetParent(contents.transform, false);
            devTop.transform.SetSiblingIndex(1); // chen giữa bg và deco
            PrefabUtility.SaveAsPrefabAsset(contents, prefabPath);
            PrefabUtility.UnloadPrefabContents(contents);

            var prefabBefore = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            var tab2Before = prefabBefore.GetComponentsInChildren<UILayoutNode>(true).First(n => n.nodeId == "tab2").transform;
            var devChildWorldBefore = tab2Before.Find("DevChildOfTab2").position;

            // Artist sửa layout: dời avatar, xoá tab2, thêm newBadge giữa avatar và gold, đổi chữ gold, đảo bg/deco.
            var doc = (Dictionary<string, object>)MiniJson.Parse(layoutJson);
            var root = (Dictionary<string, object>)doc["root"];
            var avatar = FindNode(root, "avatar");
            ((Dictionary<string, object>)((Dictionary<string, object>)avatar["rect"])["anchoredPosition"])["x"] = 60.0;
            var bottomNav = FindNode(root, "bottomNav");
            ((List<object>)bottomNav["children"]).RemoveAll(o => (string)((Dictionary<string, object>)o)["id"] == "tab2");
            var topBar = FindNode(root, "topBar");
            var newBadge = MiniJson.Parse("{\"id\":\"newBadge\",\"name\":\"newBadge\",\"type\":\"Image\",\"active\":false,\"rect\":{\"anchorMin\":{\"x\":0.5,\"y\":0.5},\"anchorMax\":{\"x\":0.5,\"y\":0.5},\"pivot\":{\"x\":0.5,\"y\":0.5},\"anchoredPosition\":{\"x\":10,\"y\":-5},\"sizeDelta\":{\"x\":64,\"y\":32},\"rotation\":0,\"scale\":{\"x\":1,\"y\":1}},\"image\":{\"sprite\":null,\"color\":{\"r\":1,\"g\":0,\"b\":0,\"a\":0.5},\"type\":\"Simple\",\"preserveAspect\":false,\"raycastTarget\":false},\"children\":[]}");
            ((List<object>)topBar["children"]).Insert(1, newBadge);
            var gold = FindNode(root, "gold");
            ((Dictionary<string, object>)gold["text"])["content"] = "9,999";
            var rc = (List<object>)root["children"];
            var t0 = rc[0]; rc[0] = rc[1]; rc[1] = t0; // deco trước bg
            MakeZip("reimport.uilayout.zip", ToJson(doc), null); // ghi đè đúng tệp nguồn đã lưu trong UILayoutRoot

            var r2 = UILayoutImporter.Reimport(AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath));
            Line("  " + r2);
            var p = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            var ids = p.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId, n => n.gameObject);

            Check(Approx(((RectTransform)ids["avatar"].transform).anchoredPosition.x, 60), "avatar dời tới x=60");
            Check(!ids.ContainsKey("tab2"), "tab2 bị xoá");
            Check(r2.deleted == 1 && r2.created == 1 && r2.rescued == 1, $"đếm: xoá {r2.deleted}, tạo {r2.created}, giữ lại {r2.rescued}");
            var rescued = ids["bottomNav"].transform.Find("DevChildOfTab2");
            Check(rescued != null && rescued.GetComponent<UILayoutNode>() == null, "GameObject dev dưới tab2 được chuyển lên bottomNav");
            Check(rescued != null && (rescued.position - devChildWorldBefore).sqrMagnitude < 1e-6f, "GameObject dev được giữ nguyên vị trí world khi chuyển cha");
            var badge = ids["topBar"].transform.Find("DevBadge");
            Check(badge != null && badge.GetComponent<DevMarker>()?.note == "badge", "DevBadge (dev thêm) còn dưới topBar cùng component");
            Check(ids["avatar"].GetComponent<DevMarker>()?.note == "avatar-dev", "component DevMarker dev gắn trên avatar còn nguyên");
            Check(Approx(ids["avatar"].GetComponent<Image>().pixelsPerUnitMultiplier, 2.5f), "giá trị dev đổi (Image.pixelsPerUnitMultiplier) không bị ghi đè");
            Check(p.GetComponent<CanvasGroup>() != null && Approx(p.GetComponent<CanvasGroup>().alpha, 0.5f), "CanvasGroup dev gắn trên gốc prefab còn nguyên");
            Check(ids.ContainsKey("newBadge") && !ids["newBadge"].activeSelf && ids["newBadge"].GetComponent<Image>().color == new Color(1, 0, 0, 0.5f), "newBadge được tạo (inactive, màu đúng)");
            var topKids = Enumerable.Range(0, ids["topBar"].transform.childCount).Select(i => ids["topBar"].transform.GetChild(i).name).ToList();
            int ia = topKids.IndexOf("avatar"), ib = topKids.IndexOf("newBadge"), ig = topKids.IndexOf("gold");
            Check(ia < ib && ib < ig, "thứ tự node dưới topBar: avatar < newBadge < gold (" + string.Join(", ", topKids) + ")");
            Check(ids["gold"].GetComponent<TextMeshProUGUI>().text == "9,999", "chữ gold cập nhật");
            var rootKids = Enumerable.Range(0, p.transform.childCount).Select(i => p.transform.GetChild(i).name).ToList();
            Check(rootKids.IndexOf("deco") < rootKids.IndexOf("bg") && rootKids.Contains("DevPopupLayer"), "đảo thứ tự bg/deco theo file, DevPopupLayer vẫn còn (" + string.Join(", ", rootKids) + ")");
            Check(rootKids.IndexOf("DevPopupLayer") == 1, "DevPopupLayer giữ đúng slot sibling 1");
            Check(p.GetComponent<UILayoutRoot>().sourceZipPath == WorkDir + "/reimport.uilayout.zip", "UILayoutRoot lưu đường dẫn zip tương đối: " + p.GetComponent<UILayoutRoot>().sourceZipPath);

            // Import lại lần nữa với cùng file: không tạo/xoá gì.
            var r3 = UILayoutImporter.Reimport(p);
            Check(r3.created == 0 && r3.deleted == 0 && r3.rescued == 0, "import lại lần 3 không đổi cấu trúc (idempotent)");
        }

        // ------------------------------------------------------------ 5. Sprite 9-slice + Text

        private static void TestSlicedSpriteAndText(string safeType)
        {
            Section("5. Sprite 9-slice và thuộc tính TextMeshPro");
            var png = MakeSlicePng();

            string json = @"{
 ""format"": ""ui-layout-studio"", ""version"": 1, ""name"": ""SliceTest"",
 ""canvas"": { ""referenceResolution"": {""x"":1080,""y"":1920}, ""screenMatchMode"": ""Expand"", ""match"": 1, ""referencePixelsPerUnit"": 100 },
 ""sprites"": [ { ""id"": ""spr1"", ""file"": ""panel_9s.png"", ""width"": 64, ""height"": 48, ""border"": [10, 12, 14, 16] } ],
 ""root"": { ""id"": ""root"", ""name"": ""SliceTest"", ""type"": ""Group"", ""active"": true,
   ""rect"": { ""anchorMin"": {""x"":0,""y"":0}, ""anchorMax"": {""x"":1,""y"":1}, ""pivot"": {""x"":0.5,""y"":0.5}, ""anchoredPosition"": {""x"":0,""y"":0}, ""sizeDelta"": {""x"":0,""y"":0}, ""rotation"": 0, ""scale"": {""x"":1,""y"":1} },
   ""children"": [
     { ""id"": ""panel"", ""name"": ""Panel"", ""type"": ""Image"", ""active"": true,
       ""rect"": { ""anchorMin"": {""x"":0.5,""y"":0.5}, ""anchorMax"": {""x"":0.5,""y"":0.5}, ""pivot"": {""x"":0.5,""y"":0.5}, ""anchoredPosition"": {""x"":0,""y"":0}, ""sizeDelta"": {""x"":600,""y"":400}, ""rotation"": 0, ""scale"": {""x"":1,""y"":1} },
       ""image"": { ""sprite"": ""spr1"", ""color"": {""r"":0.5,""g"":0.25,""b"":1,""a"":0.75}, ""type"": ""Sliced"", ""preserveAspect"": true, ""raycastTarget"": false },
       ""children"": [
         { ""id"": ""title"", ""name"": ""Title"", ""type"": ""Text"", ""active"": true,
           ""rect"": { ""anchorMin"": {""x"":0,""y"":1}, ""anchorMax"": {""x"":1,""y"":1}, ""pivot"": {""x"":0.5,""y"":1}, ""anchoredPosition"": {""x"":0,""y"":-10}, ""sizeDelta"": {""x"":-20,""y"":80}, ""rotation"": 0, ""scale"": {""x"":1,""y"":1} },
           ""text"": { ""content"": ""Xin chào"", ""font"": ""Kanit-SemiBold"", ""fontSize"": 40, ""color"": {""r"":1,""g"":0.8,""b"":0,""a"":1},
                     ""bold"": true, ""italic"": true, ""hAlign"": ""Right"", ""vAlign"": ""Top"", ""wrap"": false, ""autoSize"": true,
                     ""fontSizeMin"": 20, ""fontSizeMax"": 60, ""lineSpacing"": 5, ""characterSpacing"": 2, ""unknownField"": 123,
                     ""margin"": { ""left"": 3, ""top"": 4, ""right"": 5, ""bottom"": 6 } },
           ""children"": [] }
       ] }
   ] }
}";
            var zip = MakeZip("slice.uilayout.zip", json, new Dictionary<string, byte[]> { { "panel_9s.png", png } });
            var r = UILayoutImporter.Import(new ImportOptions { zipPath = zip, safeAreaComponentType = safeType });
            Line("  " + r);
            Check(r.prefabPath == "Assets/UI/SliceTest/SliceTest.prefab", "đường dẫn prefab mặc định: " + r.prefabPath);
            const string spritePath = "Assets/UI/SliceTest/Sprites/panel_9s.png";
            var ti = (TextureImporter)AssetImporter.GetAtPath(spritePath);
            Check(ti != null && ti.textureType == TextureImporterType.Sprite && ti.spriteImportMode == SpriteImportMode.Single, "TextureImporter: Sprite, Single");
            Check(ti != null && ti.spriteBorder == new Vector4(10, 12, 14, 16), "TextureImporter.spriteBorder = " + ti?.spriteBorder + " (cần (10,12,14,16) = l,b,r,t)");
            Check(ti != null && !ti.mipmapEnabled && ti.alphaIsTransparency && Approx(ti.spritePixelsPerUnit, 100) && ti.spritePivot == new Vector2(0.5f, 0.5f), "mipmap tắt, alphaIsTransparency, PPU 100, pivot giữa");
            var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(spritePath);
            Check(sprite != null && sprite.border == new Vector4(10, 12, 14, 16) && Approx(sprite.rect.width, 64) && Approx(sprite.rect.height, 48), "Sprite.border = " + sprite?.border + ", kích thước " + sprite?.rect.size);
            var panel = r.prefab.GetComponentsInChildren<UILayoutNode>(true).First(n => n.nodeId == "panel").GetComponent<Image>();
            Check(panel.sprite == sprite && panel.type == Image.Type.Sliced, "Image.sprite gán đúng, Image.type = " + panel.type);
            Check(panel.color == new Color(0.5f, 0.25f, 1, 0.75f) && panel.preserveAspect && !panel.raycastTarget, "Image color/preserveAspect/raycastTarget đúng");
            Check(panel.hasBorder, "Image.hasBorder = true");

            var title = r.prefab.GetComponentsInChildren<UILayoutNode>(true).First(n => n.nodeId == "title").GetComponent<TextMeshProUGUI>();
            Check(title.text == "Xin chào" && Approx(title.fontSize, 40), "TMP text/fontSize");
            Check(title.color == new Color(1, 0.8f, 0, 1), "TMP color");
            Check((title.fontStyle & FontStyles.Bold) != 0 && (title.fontStyle & FontStyles.Italic) != 0, "TMP bold + italic");
            Check(title.alignment == TextAlignmentOptions.TopRight, "TMP alignment = " + title.alignment);
            Check(title.textWrappingMode == TextWrappingModes.NoWrap, "TMP wrap tắt");
            Check(title.enableAutoSizing && Approx(title.fontSizeMin, 20) && Approx(title.fontSizeMax, 60), "TMP autoSize 20..60");
            Check(Approx(title.lineSpacing, 5) && Approx(title.characterSpacing, 2), "TMP lineSpacing/characterSpacing");
            Check(title.margin == new Vector4(3, 4, 5, 6), "TMP margin = " + title.margin + " (cần left 3, top 4, right 5, bottom 6 → Vector4(3,4,5,6))");
            Check(r.warnings.Any(w => w.Contains("Kanit-SemiBold")), "cảnh báo khi chưa ánh xạ font Kanit-SemiBold");

            // Bảng ánh xạ font: Kanit-SemiBold → một TMP_FontAsset có sẵn trong project (font mặc định của TMP).
            var guid = AssetDatabase.FindAssets("t:TMP_FontAsset").FirstOrDefault();
            if (guid == null) { Fail("project không có TMP_FontAsset nào để thử ánh xạ font"); return; }
            var fontAsset = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(AssetDatabase.GUIDToAssetPath(guid));
            var settings = ScriptableObject.CreateInstance<UILayoutStudioSettings>();
            settings.autoFindFontByName = false;
            settings.fonts.Add(new UILayoutStudioSettings.FontMapping { logicalName = "Kanit-SemiBold", font = fontAsset });
            var r2 = UILayoutImporter.Import(new ImportOptions { zipPath = zip, safeAreaComponentType = safeType, settings = settings });
            var title2 = r2.prefab.GetComponentsInChildren<UILayoutNode>(true).First(n => n.nodeId == "title").GetComponent<TextMeshProUGUI>();
            Check(title2.font == fontAsset && !r2.warnings.Any(w => w.Contains("Kanit-SemiBold")), "ánh xạ font Kanit-SemiBold → " + fontAsset.name + " qua UILayoutStudioSettings");
            Object.DestroyImmediate(settings);
        }

        /// <summary>PNG 64x48 tự sinh (dùng làm sprite 9-slice trong các bài test).</summary>
        private static byte[] MakeSlicePng()
        {
            var tex = new Texture2D(64, 48, TextureFormat.RGBA32, false);
            var px = new Color32[64 * 48];
            for (int i = 0; i < px.Length; i++) px[i] = new Color32((byte)(i % 64 * 4), (byte)(i / 64 * 5), 200, (byte)(i % 7 == 0 ? 128 : 255));
            tex.SetPixels32(px);
            tex.Apply();
            var png = tex.EncodeToPNG();
            Object.DestroyImmediate(tex);
            return png;
        }

        // ------------------------------------------------------------ 6. Từ chối version mới hơn

        private static void TestVersionReject(string layoutJson)
        {
            Section("6. Kiểm format/version");
            var doc = (Dictionary<string, object>)MiniJson.Parse(layoutJson);
            doc["version"] = 2.0;
            var zip = MakeZip("v2.uilayout.zip", ToJson(doc), null);
            bool rejected = false;
            try { UILayoutImporter.Import(new ImportOptions { zipPath = zip, prefabPath = "Assets/UI/V2/V2.prefab" }); }
            catch (FormatException e) { rejected = true; Line("  thông báo: " + e.Message); }
            Check(rejected && AssetDatabase.LoadAssetAtPath<GameObject>("Assets/UI/V2/V2.prefab") == null, "từ chối version 2, không tạo prefab");

            doc["version"] = 1.0;
            doc["format"] = "other";
            zip = MakeZip("bad.uilayout.zip", ToJson(doc), null);
            rejected = false;
            try { UILayoutImporter.Import(new ImportOptions { zipPath = zip, prefabPath = "Assets/UI/Bad/Bad.prefab" }); }
            catch (FormatException) { rejected = true; }
            Check(rejected, "từ chối format khác \"ui-layout-studio\"");
        }

        // ------------------------------------------------------------ Tiện ích

        private static string MakeZip(string name, string layoutJson, Dictionary<string, byte[]> sprites)
        {
            var path = WorkDir + "/" + name;
            if (File.Exists(path)) File.Delete(path);
            using (var fs = File.Create(path))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                var e = zip.CreateEntry("layout.json");
                using (var w = new StreamWriter(e.Open(), new UTF8Encoding(false))) w.Write(layoutJson);
                if (sprites != null)
                    foreach (var kv in sprites)
                        using (var s = zip.CreateEntry("sprites/" + kv.Key).Open()) s.Write(kv.Value, 0, kv.Value.Length);
            }
            return path;
        }

        private static Dictionary<string, object> FindNode(Dictionary<string, object> n, string id)
        {
            if ((string)n["id"] == id) return n;
            foreach (Dictionary<string, object> c in (List<object>)n["children"])
            {
                var f = FindNode(c, id);
                if (f != null) return f;
            }
            return null;
        }

        private static string ToJson(object v)
        {
            var sb = new StringBuilder();
            Write(sb, v);
            return sb.ToString();
        }

        private static void Write(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); break;
                case string s:
                    sb.Append('"');
                    foreach (var ch in s)
                    {
                        if (ch == '"' || ch == '\\') sb.Append('\\').Append(ch);
                        else if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
                        else sb.Append(ch);
                    }
                    sb.Append('"');
                    break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case double d: sb.Append(d.ToString("R", CultureInfo.InvariantCulture)); break;
                case Dictionary<string, object> o:
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in o)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        Write(sb, kv.Key);
                        sb.Append(':');
                        Write(sb, kv.Value);
                    }
                    sb.Append('}');
                    break;
                case List<object> l:
                    sb.Append('[');
                    for (int i = 0; i < l.Count; i++)
                    {
                        if (i > 0) sb.Append(',');
                        Write(sb, l[i]);
                    }
                    sb.Append(']');
                    break;
                default: throw new ArgumentException("ToJson: kiểu lạ " + v.GetType());
            }
        }

        private static bool HasArg(string name) => Environment.GetCommandLineArgs().Contains(name);

        private static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == name) return args[i + 1];
            return null;
        }

        private static float F(object o) => (float)(double)o;
        private static Vector2 V2(object o) => new Vector2(F(((Dictionary<string, object>)o)["x"]), F(((Dictionary<string, object>)o)["y"]));
        private static bool Approx(float a, float b) => Math.Abs(a - b) < 1e-4f;

        private static void Section(string title)
        {
            Line("");
            Line(title);
        }

        private static void Line(string s) => Report.AppendLine(s);

        private static void Check(bool ok, string what)
        {
            checks++;
            if (!ok) failures++;
            Line($"  [{(ok ? "PASS" : "FAIL")}] {what}");
        }

        private static void Fail(string what)
        {
            checks++;
            failures++;
            Line("  [FAIL] " + what);
        }
    }
}
