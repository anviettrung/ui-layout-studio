using System;
using System.Collections.Generic;
using UnityEngine;

namespace UILayoutStudio.EditorTools
{
    // Mô hình layout.json (docs/FORMAT.md, version 1). Trường thiếu lấy giá trị mặc định như editor web,
    // trường lạ bỏ qua.

    public sealed class LayoutDocument
    {
        public const string FormatId = "ui-layout-studio";
        public const int SupportedVersion = 1;

        public string format;
        public int version;
        public string name;
        public LayoutCanvas canvas = new LayoutCanvas();
        public List<LayoutSprite> sprites = new List<LayoutSprite>();
        public LayoutNodeData root;

        public static LayoutDocument Parse(string json)
        {
            if (!(MiniJson.Parse(json) is Dictionary<string, object> o))
                throw new FormatException("layout.json phải là một object JSON.");
            var doc = new LayoutDocument
            {
                format = J.Str(o, "format", null),
                version = (int)J.Num(o, "version", 0),
                name = J.Str(o, "name", "Layout"),
            };
            if (doc.format != FormatId)
                throw new FormatException($"Không phải tệp UI Layout Studio (format = \"{doc.format}\", cần \"{FormatId}\").");
            if (doc.version < 1 || doc.version > SupportedVersion)
                throw new FormatException($"layout.json version {doc.version} không được hỗ trợ (importer này hiểu tới version {SupportedVersion}). Hãy cập nhật package.");

            if (J.Obj(o, "canvas") is Dictionary<string, object> c)
            {
                doc.canvas.referenceResolution = J.V2(c, "referenceResolution", new Vector2(1080, 1920));
                doc.canvas.screenMatchMode = J.Str(c, "screenMatchMode", "Expand");
                doc.canvas.match = J.Num(c, "match", 1f);
                doc.canvas.referencePixelsPerUnit = J.Num(c, "referencePixelsPerUnit", 100f);
            }

            if (J.Arr(o, "sprites") is List<object> sl)
            {
                foreach (var it in sl)
                {
                    if (!(it is Dictionary<string, object> s)) continue;
                    var sp = new LayoutSprite
                    {
                        id = J.Str(s, "id", null),
                        file = J.Str(s, "file", null),
                        width = (int)J.Num(s, "width", 0),
                        height = (int)J.Num(s, "height", 0),
                    };
                    if (J.Arr(s, "border") is List<object> b && b.Count >= 4)
                        sp.border = new Vector4(J.F(b[0]), J.F(b[1]), J.F(b[2]), J.F(b[3])); // l, b, r, t
                    if (!string.IsNullOrEmpty(sp.id) && !string.IsNullOrEmpty(sp.file)) doc.sprites.Add(sp);
                }
            }

            if (!(J.Obj(o, "root") is Dictionary<string, object> r))
                throw new FormatException("layout.json thiếu root.");
            doc.root = LayoutNodeData.Parse(r, 0);
            return doc;
        }

        /// <summary>Duyệt toàn cây, cha trước con.</summary>
        public IEnumerable<(LayoutNodeData node, LayoutNodeData parent)> Walk()
        {
            var stack = new Stack<(LayoutNodeData, LayoutNodeData)>();
            stack.Push((root, null));
            while (stack.Count > 0)
            {
                var (n, p) = stack.Pop();
                yield return (n, p);
                for (int i = n.children.Count - 1; i >= 0; i--) stack.Push((n.children[i], n));
            }
        }
    }

    public sealed class LayoutCanvas
    {
        public Vector2 referenceResolution = new Vector2(1080, 1920);
        public string screenMatchMode = "Expand";
        public float match = 1;
        public float referencePixelsPerUnit = 100;
    }

    public sealed class LayoutSprite
    {
        public string id;
        public string file;
        public int width;
        public int height;
        /// <summary>left, bottom, right, top (pixel ảnh), đúng thứ tự Sprite.border của Unity.</summary>
        public Vector4 border;
    }

    public sealed class LayoutRect
    {
        public Vector2 anchorMin = new Vector2(0.5f, 0.5f);
        public Vector2 anchorMax = new Vector2(0.5f, 0.5f);
        public Vector2 pivot = new Vector2(0.5f, 0.5f);
        public Vector2 anchoredPosition;
        public Vector2 sizeDelta = new Vector2(200, 200);
        public float rotation;
        public Vector2 scale = Vector2.one;
    }

    public sealed class LayoutImage
    {
        public string sprite;
        public Color color = Color.white;
        public string type = "Simple";
        public bool preserveAspect;
        public bool raycastTarget = true;
        // type = "Filled"
        public string fillMethod = "Radial360";
        public int fillOrigin;
        public float fillAmount = 1;
        public bool fillClockwise = true;
    }

    /// <summary>layoutGroup: HorizontalLayoutGroup / VerticalLayoutGroup / GridLayoutGroup. Mặc định như Unity.</summary>
    public sealed class LayoutGroupData
    {
        public const string Horizontal = "Horizontal", Vertical = "Vertical", Grid = "Grid";

        public string type = Horizontal;
        public int paddingLeft, paddingRight, paddingTop, paddingBottom;
        public string childAlignment = "UpperLeft";
        // Horizontal / Vertical
        public float spacing;
        public bool reverseArrangement;
        public bool childControlWidth, childControlHeight;
        public bool childScaleWidth, childScaleHeight;
        public bool childForceExpandWidth = true, childForceExpandHeight = true;
        // Grid
        public Vector2 cellSize = new Vector2(100, 100);
        public Vector2 gridSpacing = Vector2.zero;
        public string startCorner = "UpperLeft";
        public string startAxis = "Horizontal";
        public string constraint = "Flexible";
        public int constraintCount = 2;
    }

    /// <summary>layoutElement: LayoutElement. -1 = không đặt.</summary>
    public sealed class LayoutElementData
    {
        public bool ignoreLayout;
        public float minWidth = -1, minHeight = -1, preferredWidth = -1, preferredHeight = -1, flexibleWidth = -1, flexibleHeight = -1;
        public int layoutPriority = 1;
    }

    public sealed class ContentSizeFitterData
    {
        public string horizontalFit = "Unconstrained";
        public string verticalFit = "Unconstrained";
    }

    public sealed class MaskData
    {
        public const string TypeMask = "Mask", TypeRectMask2D = "RectMask2D";
        public string type = TypeMask;
        public bool showMaskGraphic = true;
    }

    public sealed class LayoutText
    {
        public string content = "";
        public string font = "";
        public float fontSize = 48;
        public Color color = Color.white;
        public bool bold;
        public bool italic;
        public string hAlign = "Center";
        public string vAlign = "Middle";
        public bool wrap = true;
        public bool autoSize;
        public float fontSizeMin = 18;
        public float fontSizeMax = 72;
        public float lineSpacing;
        public float characterSpacing;
        /// <summary>TMP_Text.margin: x = left, y = top, z = right, w = bottom.</summary>
        public Vector4 margin;

        // Material TMP (viền, bóng). Xem docs/FORMAT.md "Viền, bóng chữ".
        /// <summary>Tên material preset trong Unity, null = không có.</summary>
        public string materialPreset;
        /// <summary>_FaceDilate, -1..1.</summary>
        public float faceDilate;
        /// <summary>null = không viền.</summary>
        public TextOutline outline;
        /// <summary>null = không bóng.</summary>
        public TextUnderlay underlay;
        /// <summary>File có ít nhất một trong các trường materialPreset, faceDilate, outline, underlay.</summary>
        public bool hasMaterialFields;

        /// <summary>Thông số khác mặc định (cần material riêng thay cho material mặc định của font).</summary>
        public bool HasNonDefaultMaterialParams =>
            faceDilate != 0 || (outline != null && outline.width > 0) || underlay != null;
    }

    public sealed class TextOutline
    {
        public float width;
        public Color color = Color.black;
    }

    public sealed class TextUnderlay
    {
        public Color color = new Color(0, 0, 0, 0.5f);
        public float offsetX, offsetY, dilate, softness;
    }

    public sealed class LayoutNodeData
    {
        public const string TypeGroup = "Group", TypeImage = "Image", TypeText = "Text", TypeSafeArea = "SafeArea";

        public string id;
        public string name;
        public string type = TypeGroup;
        public bool active = true;
        public LayoutRect rect = new LayoutRect();
        public LayoutImage image;
        public LayoutText text;
        public LayoutGroupData layoutGroup;
        public LayoutElementData layoutElement;
        public ContentSizeFitterData contentSizeFitter;
        public MaskData mask;
        public List<LayoutNodeData> children = new List<LayoutNodeData>();

        internal static LayoutNodeData Parse(Dictionary<string, object> o, int depth)
        {
            if (depth > 512) throw new FormatException("Cây node quá sâu.");
            var n = new LayoutNodeData
            {
                id = J.Str(o, "id", null),
                name = J.Str(o, "name", null),
                type = J.Str(o, "type", TypeGroup),
                active = J.Bool(o, "active", true),
            };
            if (string.IsNullOrEmpty(n.id)) throw new FormatException($"Node \"{n.name}\" thiếu id.");
            if (string.IsNullOrEmpty(n.name)) n.name = n.type;
            if (n.type != TypeGroup && n.type != TypeImage && n.type != TypeText && n.type != TypeSafeArea)
            {
                Debug.LogWarning($"[UI Layout Studio] Node \"{n.name}\" có type lạ \"{n.type}\", coi như Group.");
                n.type = TypeGroup;
            }

            if (J.Obj(o, "rect") is Dictionary<string, object> r)
            {
                var d = n.rect;
                d.anchorMin = J.V2(r, "anchorMin", d.anchorMin);
                d.anchorMax = J.V2(r, "anchorMax", d.anchorMax);
                d.pivot = J.V2(r, "pivot", d.pivot);
                d.anchoredPosition = J.V2(r, "anchoredPosition", d.anchoredPosition);
                d.sizeDelta = J.V2(r, "sizeDelta", d.sizeDelta);
                d.rotation = J.Num(r, "rotation", 0);
                d.scale = J.V2(r, "scale", Vector2.one);
            }

            if (n.type == TypeImage)
            {
                n.image = new LayoutImage();
                if (J.Obj(o, "image") is Dictionary<string, object> im)
                {
                    n.image.sprite = J.Str(im, "sprite", null);
                    n.image.color = J.Col(im, "color", Color.white);
                    n.image.type = J.Str(im, "type", "Simple");
                    n.image.preserveAspect = J.Bool(im, "preserveAspect", false);
                    n.image.raycastTarget = J.Bool(im, "raycastTarget", true);
                    n.image.fillMethod = J.Str(im, "fillMethod", "Radial360");
                    n.image.fillOrigin = (int)J.Num(im, "fillOrigin", 0);
                    n.image.fillAmount = J.Num(im, "fillAmount", 1);
                    n.image.fillClockwise = J.Bool(im, "fillClockwise", true);
                }
            }

            if (n.type == TypeText)
            {
                var t = n.text = new LayoutText();
                if (J.Obj(o, "text") is Dictionary<string, object> tx)
                {
                    t.content = J.Str(tx, "content", "");
                    t.font = J.Str(tx, "font", "");
                    t.fontSize = J.Num(tx, "fontSize", 48);
                    t.color = J.Col(tx, "color", Color.white);
                    t.bold = J.Bool(tx, "bold", false);
                    t.italic = J.Bool(tx, "italic", false);
                    t.hAlign = J.Str(tx, "hAlign", "Center");
                    t.vAlign = J.Str(tx, "vAlign", "Middle");
                    t.wrap = J.Bool(tx, "wrap", true);
                    t.autoSize = J.Bool(tx, "autoSize", false);
                    t.fontSizeMin = J.Num(tx, "fontSizeMin", 18);
                    t.fontSizeMax = J.Num(tx, "fontSizeMax", 72);
                    t.lineSpacing = J.Num(tx, "lineSpacing", 0);
                    t.characterSpacing = J.Num(tx, "characterSpacing", 0);
                    if (J.Obj(tx, "margin") is Dictionary<string, object> mg)
                        t.margin = new Vector4(J.Num(mg, "left", 0), J.Num(mg, "top", 0), J.Num(mg, "right", 0), J.Num(mg, "bottom", 0));

                    var preset = J.Str(tx, "materialPreset", null);
                    t.materialPreset = string.IsNullOrWhiteSpace(preset) ? null : preset.Trim();
                    t.faceDilate = J.Num(tx, "faceDilate", 0);
                    if (J.Obj(tx, "outline") is Dictionary<string, object> ol)
                        t.outline = new TextOutline { width = J.Num(ol, "width", 0), color = J.Col(ol, "color", Color.black) };
                    if (J.Obj(tx, "underlay") is Dictionary<string, object> ul)
                        t.underlay = new TextUnderlay
                        {
                            color = J.Col(ul, "color", new Color(0, 0, 0, 0.5f)),
                            offsetX = J.Num(ul, "offsetX", 0),
                            offsetY = J.Num(ul, "offsetY", 0),
                            dilate = J.Num(ul, "dilate", 0),
                            softness = J.Num(ul, "softness", 0),
                        };
                    t.hasMaterialFields = t.materialPreset != null || J.Get(tx, "faceDilate") is double || t.outline != null || t.underlay != null;
                }
            }

            if (J.Obj(o, "layoutGroup") is Dictionary<string, object> lg)
            {
                var g = n.layoutGroup = new LayoutGroupData();
                g.type = J.Str(lg, "type", LayoutGroupData.Horizontal);
                if (J.Obj(lg, "padding") is Dictionary<string, object> pad)
                {
                    g.paddingLeft = Mathf.RoundToInt(J.Num(pad, "left", 0));
                    g.paddingRight = Mathf.RoundToInt(J.Num(pad, "right", 0));
                    g.paddingTop = Mathf.RoundToInt(J.Num(pad, "top", 0));
                    g.paddingBottom = Mathf.RoundToInt(J.Num(pad, "bottom", 0));
                }
                g.childAlignment = J.Str(lg, "childAlignment", "UpperLeft");
                g.spacing = J.Num(lg, "spacing", 0);
                g.reverseArrangement = J.Bool(lg, "reverseArrangement", false);
                g.childControlWidth = J.Bool(lg, "childControlWidth", false);
                g.childControlHeight = J.Bool(lg, "childControlHeight", false);
                g.childScaleWidth = J.Bool(lg, "childScaleWidth", false);
                g.childScaleHeight = J.Bool(lg, "childScaleHeight", false);
                g.childForceExpandWidth = J.Bool(lg, "childForceExpandWidth", true);
                g.childForceExpandHeight = J.Bool(lg, "childForceExpandHeight", true);
                g.cellSize = J.V2(lg, "cellSize", new Vector2(100, 100));
                g.gridSpacing = J.V2(lg, "gridSpacing", Vector2.zero);
                g.startCorner = J.Str(lg, "startCorner", "UpperLeft");
                g.startAxis = J.Str(lg, "startAxis", "Horizontal");
                g.constraint = J.Str(lg, "constraint", "Flexible");
                g.constraintCount = (int)J.Num(lg, "constraintCount", 2);
            }

            if (J.Obj(o, "layoutElement") is Dictionary<string, object> le)
            {
                var e = n.layoutElement = new LayoutElementData();
                e.ignoreLayout = J.Bool(le, "ignoreLayout", false);
                e.minWidth = J.Num(le, "minWidth", -1);
                e.minHeight = J.Num(le, "minHeight", -1);
                e.preferredWidth = J.Num(le, "preferredWidth", -1);
                e.preferredHeight = J.Num(le, "preferredHeight", -1);
                e.flexibleWidth = J.Num(le, "flexibleWidth", -1);
                e.flexibleHeight = J.Num(le, "flexibleHeight", -1);
                e.layoutPriority = (int)J.Num(le, "layoutPriority", 1);
            }

            if (J.Obj(o, "contentSizeFitter") is Dictionary<string, object> cf)
                n.contentSizeFitter = new ContentSizeFitterData
                {
                    horizontalFit = J.Str(cf, "horizontalFit", "Unconstrained"),
                    verticalFit = J.Str(cf, "verticalFit", "Unconstrained"),
                };

            if (J.Obj(o, "mask") is Dictionary<string, object> mk)
                n.mask = new MaskData
                {
                    type = J.Str(mk, "type", MaskData.TypeMask),
                    showMaskGraphic = J.Bool(mk, "showMaskGraphic", true),
                };

            if (J.Arr(o, "children") is List<object> cl)
                foreach (var c in cl)
                    if (c is Dictionary<string, object> co)
                        n.children.Add(Parse(co, depth + 1));
            return n;
        }
    }

    /// <summary>Hàm đọc giá trị có mặc định từ cây MiniJson.</summary>
    internal static class J
    {
        public static object Get(Dictionary<string, object> o, string k) => o.TryGetValue(k, out var v) ? v : null;
        public static Dictionary<string, object> Obj(Dictionary<string, object> o, string k) => Get(o, k) as Dictionary<string, object>;
        public static List<object> Arr(Dictionary<string, object> o, string k) => Get(o, k) as List<object>;
        public static string Str(Dictionary<string, object> o, string k, string def) => Get(o, k) is string s ? s : def;
        public static float Num(Dictionary<string, object> o, string k, float def) => Get(o, k) is double d ? (float)d : def;
        public static bool Bool(Dictionary<string, object> o, string k, bool def) => Get(o, k) is bool b ? b : def;
        public static float F(object v) => v is double d ? (float)d : 0f;

        public static Vector2 V2(Dictionary<string, object> o, string k, Vector2 def)
        {
            if (!(Obj(o, k) is Dictionary<string, object> v)) return def;
            return new Vector2(Num(v, "x", def.x), Num(v, "y", def.y));
        }

        public static Color Col(Dictionary<string, object> o, string k, Color def)
        {
            if (!(Obj(o, k) is Dictionary<string, object> v)) return def;
            return new Color(Num(v, "r", def.r), Num(v, "g", def.g), Num(v, "b", def.b), Num(v, "a", def.a));
        }
    }
}
