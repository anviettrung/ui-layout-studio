// Phần kiểm chứng material TextMeshPro (viền, bóng, preset): docs/FORMAT.md "Viền, bóng chữ".
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using TMPro;
using UILayoutStudio;
using UILayoutStudio.EditorTools;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace ULSVerify
{
    public static partial class ULSVerifyRunner
    {
        private const string MatFolder = "Assets/UI/_TMPMaterials";
        private const string MatPrefab = "Assets/UI/TextMaterial/TextMaterial.prefab";
        private const string MobileFontPath = "Assets/UI/_Fonts/LibMobile SDF.asset";
        private const string PresetName = "ULS Verify Preset";

        // ------------------------------------------------------------ 10. Material TMP

        private static void TestTextMaterial(string safeType)
        {
            Section("10. Material TextMeshPro: preset, viền, bóng, dùng chung, import lại");
            var font = TMP_Settings.defaultFontAsset;
            if (font == null || font.material == null) { Fail("không có font mặc định TMP để thử"); return; }

            // Font thứ hai dùng shader Mobile SDF (chép font mặc định, đổi shader material của bản chép).
            UILayoutImporter.EnsureFolder("Assets/UI/_Fonts");
            AssetDatabase.CopyAsset(AssetDatabase.GetAssetPath(font), MobileFontPath);
            var mobileFont = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(MobileFontPath);
            var mobileShader = Shader.Find("TextMeshPro/Mobile/Distance Field");
            if (mobileFont == null || mobileShader == null) { Fail("không dựng được font shader Mobile SDF"); return; }
            mobileFont.material.shader = mobileShader;
            EditorUtility.SetDirty(mobileFont.material);
            AssetDatabase.SaveAssets();
            Check(mobileFont.material.GetTexture("_MainTex") == mobileFont.atlasTexture && mobileFont.atlasTexture != font.atlasTexture,
                "font Mobile chép ra có atlas riêng, material trỏ đúng atlas của nó");

            // Preset có sẵn: bản đúng (atlas font mặc định) và bản trùng tên dùng atlas khác (phải bị bỏ qua).
            UILayoutImporter.EnsureFolder("Assets/UI/_Presets/A");
            UILayoutImporter.EnsureFolder("Assets/UI/_Presets/B");
            var decoy = new Material(mobileFont.material) { name = PresetName };
            AssetDatabase.CreateAsset(decoy, "Assets/UI/_Presets/A/" + PresetName + ".mat");
            var preset = new Material(font.material) { name = PresetName };
            preset.SetFloat("_OutlineWidth", 0.15f);
            preset.EnableKeyword("OUTLINE_ON");
            AssetDatabase.CreateAsset(preset, "Assets/UI/_Presets/B/" + PresetName + ".mat");
            var tmpOutline = FindMaterialByName("LiberationSans SDF - Outline");
            AssetDatabase.SaveAssets();

            var settings = ScriptableObject.CreateInstance<UILayoutStudioSettings>();
            settings.autoFindFontByName = false;
            settings.fonts.Add(new UILayoutStudioSettings.FontMapping { logicalName = "Lib", font = font });
            settings.fonts.Add(new UILayoutStudioSettings.FontMapping { logicalName = "LibMobile", font = mobileFont });
            Check(settings.tmpMaterialFolder == MatFolder, "UILayoutStudioSettings.tmpMaterialFolder mặc định = " + settings.tmpMaterialFolder);

            const string outlineRed = @"""outline"": { ""width"": 0.3, ""color"": {""r"":1,""g"":0,""b"":0,""a"":1} }";
            const string underlayStd = @"""underlay"": { ""color"": {""r"":0,""g"":0,""b"":0.5,""a"":0.75}, ""offsetX"": 0.5, ""offsetY"": -0.25, ""dilate"": 0.1, ""softness"": 0.2 }";
            var nodes1 = new List<string>
            {
                TextNode("pExist", "Lib", @"""materialPreset"": ""LiberationSans SDF - Outline"", ""faceDilate"": 0.5"),
                TextNode("pDecoy", "Lib", $@"""materialPreset"": ""{PresetName}"""),
                TextNode("pSub", "Lib", @"""materialPreset"": ""LiberationSans SDF Material"""),
                TextNode("pMissing", "Lib", @"""materialPreset"": ""ULS No Such Preset"", ""faceDilate"": 0.1, ""outline"": { ""width"": 0.2, ""color"": {""r"":0,""g"":0,""b"":0,""a"":1} }"),
                TextNode("pMissingNoParams", "Lib", @"""materialPreset"": ""ULS No Such Preset 2"""),
                TextNode("shared1", "Lib", outlineRed + ", " + underlayStd),
                TextNode("shared2", "Lib", @"""materialPreset"": ""ULS Nope"", " + outlineRed + ", " + underlayStd),
                TextNode("shared3", "Lib", outlineRed + ", " + underlayStd),
                TextNode("dilateOnly", "Lib", @"""faceDilate"": 0.25"),
                TextNode("underlayOnly", "Lib", underlayStd),
                TextNode("outlineZero", "Lib", @"""outline"": { ""width"": 0, ""color"": {""r"":1,""g"":1,""b"":1,""a"":1} }"),
                TextNode("mobile", "LibMobile", outlineRed + ", " + underlayStd),
                TextNode("plain", "Lib", null),
                TextNode("devMat", "Lib", null),
                TextNode("managed", "Lib", @"""outline"": { ""width"": 0.1, ""color"": {""r"":1,""g"":1,""b"":1,""a"":1} }"),
            };
            var zip = MakeZip("textmat.uilayout.zip", MatLayout(nodes1), null);
            var opts = new ImportOptions { zipPath = zip, prefabPath = MatPrefab, safeAreaComponentType = safeType, settings = settings };
            var r = UILayoutImporter.Import(opts);
            Line("  " + r);
            foreach (var w in r.warnings) Line("    cảnh báo: " + w);
            var t = Texts(r.prefab);
            var ln = r.prefab.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId);

            // (a) preset có sẵn
            Check(tmpOutline != null && t["pExist"].fontSharedMaterial == tmpOutline, "(a) preset có sẵn \"LiberationSans SDF - Outline\" được gán (thông số đi kèm bỏ qua)");
            Check(t["pDecoy"].fontSharedMaterial == preset, "(a) hai material trùng tên \"" + PresetName + "\": chọn bản có _MainTex là atlas của font (" + AssetDatabase.GetAssetPath(t["pDecoy"].fontSharedMaterial) + ")");
            Check(t["pSub"].fontSharedMaterial == font.material, "(a) preset là sub-asset của font asset (material mặc định của font) tìm được");
            Check(!r.warnings.Any(w => w.Contains("\"LiberationSans SDF - Outline\"") || w.Contains("\"LiberationSans SDF Material\"")), "không cảnh báo cho preset tìm thấy");

            // (b) preset không tồn tại + thông số → tạo preset mới
            var mMissing = t["pMissing"].fontSharedMaterial;
            Check(r.warnings.Any(w => w.Contains("ULS No Such Preset\"")), "(b) cảnh báo preset \"ULS No Such Preset\" không tồn tại");
            Check(IsGenerated(mMissing, font), "(b) tạo preset mới: " + AssetDatabase.GetAssetPath(mMissing));
            CheckParams(mMissing, "(b) pMissing", dilate: 0.1f, outlineWidth: 0.2f, outlineColor: Color.black, underlay: null);
            Check(t["pMissingNoParams"].fontSharedMaterial == font.material && r.warnings.Any(w => w.Contains("ULS No Such Preset 2")),
                "(b) preset không tồn tại, không có thông số → material mặc định của font, có cảnh báo");

            // (c) cùng thông số dùng chung một asset (kể cả đi qua nhánh preset không tìm thấy)
            var mShared = t["shared1"].fontSharedMaterial;
            Check(IsGenerated(mShared, font) && t["shared2"].fontSharedMaterial == mShared && t["shared3"].fontSharedMaterial == mShared,
                "(c) shared1, shared2 (preset thiếu), shared3 cùng thông số dùng chung " + AssetDatabase.GetAssetPath(mShared));
            CheckParams(mShared, "(c) shared", dilate: 0, outlineWidth: 0.3f, outlineColor: Color.red,
                underlay: new[] { 0f, 0f, 0.5f, 0.75f, 0.5f, -0.25f, 0.1f, 0.2f });

            // (d) chỉ thông số, không preset
            var mDilate = t["dilateOnly"].fontSharedMaterial;
            Check(IsGenerated(mDilate, font), "(d) chỉ faceDilate → preset tự tạo " + AssetDatabase.GetAssetPath(mDilate));
            CheckParams(mDilate, "(d) dilateOnly", dilate: 0.25f, outlineWidth: 0, outlineColor: null, underlay: null);
            var mUnder = t["underlayOnly"].fontSharedMaterial;
            Check(IsGenerated(mUnder, font) && mUnder != mShared, "(d) chỉ underlay → preset riêng " + AssetDatabase.GetAssetPath(mUnder));
            CheckParams(mUnder, "(d) underlayOnly", dilate: 0, outlineWidth: 0, outlineColor: null,
                underlay: new[] { 0f, 0f, 0.5f, 0.75f, 0.5f, -0.25f, 0.1f, 0.2f });
            Check(t["outlineZero"].fontSharedMaterial == font.material, "(d) outline width 0, không gì khác → material mặc định của font");
            var mMobile = t["mobile"].fontSharedMaterial;
            Check(IsGenerated(mMobile, mobileFont) && mMobile != mShared && mMobile.shader == mobileShader,
                "(d) font khác (shader Mobile SDF) cùng thông số → preset riêng của font đó, shader Mobile: " + AssetDatabase.GetAssetPath(mMobile));
            CheckParams(mMobile, "(d) mobile", dilate: 0, outlineWidth: 0.3f, outlineColor: Color.red,
                underlay: new[] { 0f, 0f, 0.5f, 0.75f, 0.5f, -0.25f, 0.1f, 0.2f });
            Check(mMobile.IsKeywordEnabled("OUTLINE_ON") && mMobile.IsKeywordEnabled("UNDERLAY_ON"),
                "(d) shader Mobile khai báo keyword: IsKeywordEnabled(OUTLINE_ON, UNDERLAY_ON)");
            Check(t["plain"].fontSharedMaterial == font.material && t["devMat"].fontSharedMaterial == font.material, "không có trường material → material mặc định của font");
            Check(ln["managed"].managedMaterial == t["managed"].fontSharedMaterial && ln["plain"].managedMaterial == font.material && ln["pExist"].managedMaterial == tmpOutline,
                "UILayoutNode.managedMaterial ghi material importer đã gán");

            var files1 = MatFiles();
            Line("  material tự tạo: " + string.Join(", ", files1.Select(Path.GetFileName)));
            // pMissing, shared, dilateOnly, underlayOnly, mobile, managed
            Check(files1.Count == 6, $"số asset trong {MatFolder} = {files1.Count} (cần 6: mỗi bộ font + thông số một asset)");
            var nameRe = new Regex(@"^(LiberationSans SDF|LibMobile SDF) ULS [0-9a-f]{8}\.mat$");
            Check(files1.All(f => nameRe.IsMatch(Path.GetFileName(f))), "tên dạng \"<font> ULS <8 hex>\"");
            var guids1 = files1.ToDictionary(f => f, AssetDatabase.AssetPathToGUID);

            // (e) import lần hai cùng file: không tạo asset mới, cùng material
            var r2 = UILayoutImporter.Import(opts);
            var t2 = Texts(r2.prefab);
            var files2 = MatFiles();
            Check(files2.SequenceEqual(files1) && files2.All(f => AssetDatabase.AssetPathToGUID(f) == guids1[f]), "(e) import lần hai: không tạo asset mới, GUID giữ nguyên");
            Check(t2.All(kv => kv.Value.fontSharedMaterial == t[kv.Key].fontSharedMaterial), "(e) import lần hai: mọi chữ giữ đúng material");

            // (f) dev đổi material: trên chữ không có trường material → giữ; trên chữ có trường → theo file.
            var devMaterial = FindMaterialByName("LiberationSans SDF - Drop Shadow");
            var root = PrefabUtility.LoadPrefabContents(MatPrefab);
            try
            {
                var tt = Texts(root);
                tt["devMat"].fontSharedMaterial = devMaterial;
                tt["pExist"].fontSharedMaterial = devMaterial;
                PrefabUtility.SaveAsPrefabAsset(root, MatPrefab);
            }
            finally { PrefabUtility.UnloadPrefabContents(root); }

            // File lần ba: node managed bỏ trường outline (material do importer gán → về mặc định của font).
            var nodes3 = nodes1.Select(s => s.Contains("\"id\": \"managed\"") ? TextNode("managed", "Lib", null) : s).ToList();
            var zip3 = MakeZip("textmat3.uilayout.zip", MatLayout(nodes3), null);
            var r3 = UILayoutImporter.Import(new ImportOptions { zipPath = zip3, prefabPath = MatPrefab, safeAreaComponentType = safeType, settings = settings });
            var t3 = Texts(r3.prefab);
            var ln3 = r3.prefab.GetComponentsInChildren<UILayoutNode>(true).ToDictionary(n => n.nodeId);
            Check(devMaterial != null && t3["devMat"].fontSharedMaterial == devMaterial, "(f) dev đổi material trên chữ không có trường material → giữ (" + t3["devMat"].fontSharedMaterial?.name + ")");
            Check(t3["pExist"].fontSharedMaterial == tmpOutline, "(f) dev đổi material trên chữ có materialPreset → importer gán lại theo file");
            Check(t3["managed"].fontSharedMaterial == font.material && ln3["managed"].managedMaterial == font.material,
                "file bỏ outline trên chữ material do importer gán → về material mặc định của font");
            Check(MatFiles().SequenceEqual(files1), "import lần ba không tạo asset mới (asset cũ không còn dùng vẫn để lại)");
            Check(t3["shared1"].fontSharedMaterial == mShared && t3["plain"].fontSharedMaterial == font.material, "các chữ khác giữ material");

            // Material importer gán là asset dùng chung, không phải instance.
            Check(t3.Values.All(x => AssetDatabase.Contains(x.fontSharedMaterial)), "mọi fontSharedMaterial là asset trong project (không tạo instance)");
            Object.DestroyImmediate(settings);
        }

        private static Material FindMaterialByName(string name)
        {
            foreach (var g in AssetDatabase.FindAssets("t:Material " + name))
            {
                var m = AssetDatabase.LoadAssetAtPath<Material>(AssetDatabase.GUIDToAssetPath(g));
                if (m != null && m.name == name) return m;
            }
            return null;
        }

        private static List<string> MatFiles() =>
            AssetDatabase.IsValidFolder(MatFolder)
                ? AssetDatabase.FindAssets("t:Material", new[] { MatFolder }).Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p, StringComparer.Ordinal).ToList()
                : new List<string>();

        private static bool IsGenerated(Material m, TMP_FontAsset font) =>
            m != null && AssetDatabase.GetAssetPath(m).StartsWith(MatFolder + "/") && m.name.StartsWith(font.name + " ULS ") &&
            m.GetTexture("_MainTex") == font.atlasTexture && m.shader == font.material.shader;

        private static void CheckParams(Material m, string label, float dilate, float outlineWidth, Color? outlineColor, float[] underlay)
        {
            if (m == null) { Fail(label + ": không có material"); return; }
            var kw = m.shaderKeywords;
            bool outlineOn = outlineWidth > 0, underlayOn = underlay != null;
            bool ok = Approx(m.GetFloat("_FaceDilate"), dilate) && Approx(m.GetFloat("_OutlineWidth"), outlineWidth);
            if (outlineColor.HasValue) ok &= m.GetColor("_OutlineColor") == outlineColor.Value;
            ok &= kw.Contains("OUTLINE_ON") == outlineOn && kw.Contains("UNDERLAY_ON") == underlayOn && !kw.Contains("UNDERLAY_INNER");
            if (underlayOn)
            {
                ok &= m.GetColor("_UnderlayColor") == new Color(underlay[0], underlay[1], underlay[2], underlay[3]);
                ok &= Approx(m.GetFloat("_UnderlayOffsetX"), underlay[4]) && Approx(m.GetFloat("_UnderlayOffsetY"), underlay[5]);
                ok &= Approx(m.GetFloat("_UnderlayDilate"), underlay[6]) && Approx(m.GetFloat("_UnderlaySoftness"), underlay[7]);
            }
            var desc = new StringBuilder();
            desc.Append($"_FaceDilate={m.GetFloat("_FaceDilate"):0.###} _OutlineWidth={m.GetFloat("_OutlineWidth"):0.###}");
            if (outlineOn) desc.Append(" _OutlineColor=" + m.GetColor("_OutlineColor"));
            if (underlayOn)
                desc.Append($" _UnderlayColor={m.GetColor("_UnderlayColor")} offset=({m.GetFloat("_UnderlayOffsetX"):0.###},{m.GetFloat("_UnderlayOffsetY"):0.###}) " +
                            $"dilate={m.GetFloat("_UnderlayDilate"):0.###} softness={m.GetFloat("_UnderlaySoftness"):0.###}");
            desc.Append(" keywords=[" + string.Join(" ", kw) + "]");
            Check(ok, label + ": " + desc);
        }

        private static Dictionary<string, TextMeshProUGUI> Texts(GameObject root) =>
            root.GetComponentsInChildren<UILayoutNode>(true).Where(n => n.nodeType == LayoutNodeData.TypeText)
                .ToDictionary(n => n.nodeId, n => n.GetComponent<TextMeshProUGUI>());

        private static string TextNode(string id, string font, string extra)
        {
            var y = 0;
            return $@"{{ ""id"": ""{id}"", ""name"": ""{id}"", ""type"": ""Text"", ""active"": true,
  ""rect"": {{ ""anchorMin"": {{""x"":0.5,""y"":0.5}}, ""anchorMax"": {{""x"":0.5,""y"":0.5}}, ""pivot"": {{""x"":0.5,""y"":0.5}}, ""anchoredPosition"": {{""x"":0,""y"":{y}}}, ""sizeDelta"": {{""x"":400,""y"":80}}, ""rotation"": 0, ""scale"": {{""x"":1,""y"":1}} }},
  ""text"": {{ ""content"": ""{id}"", ""font"": ""{font}"", ""fontSize"": 40{(string.IsNullOrEmpty(extra) ? "" : ", " + extra)} }},
  ""children"": [] }}";
        }

        private static string MatLayout(List<string> nodes) => $@"{{
 ""format"": ""ui-layout-studio"", ""version"": 1, ""name"": ""TextMaterial"",
 ""canvas"": {{ ""referenceResolution"": {{""x"":1080,""y"":1920}}, ""screenMatchMode"": ""Expand"", ""match"": 1, ""referencePixelsPerUnit"": 100 }},
 ""fontInfo"": {{ ""Lib"": {{ ""pointSize"": 90, ""padding"": 9 }} }},
 ""root"": {{ ""id"": ""root"", ""name"": ""TextMaterial"", ""type"": ""Group"", ""active"": true,
   ""rect"": {{ ""anchorMin"": {{""x"":0,""y"":0}}, ""anchorMax"": {{""x"":1,""y"":1}}, ""pivot"": {{""x"":0.5,""y"":0.5}}, ""anchoredPosition"": {{""x"":0,""y"":0}}, ""sizeDelta"": {{""x"":0,""y"":0}}, ""rotation"": 0, ""scale"": {{""x"":1,""y"":1}} }},
   ""children"": [
{string.Join(",\n", nodes)}
   ] }}
}}";
    }
}
