using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace UILayoutStudio.EditorTools
{
    /// <summary>
    /// Bộ đọc JSON nhỏ: object → Dictionary&lt;string, object&gt;, array → List&lt;object&gt;,
    /// số → double, true/false → bool, null → null. Không dùng JsonUtility vì nó giới hạn độ sâu
    /// kiểu đệ quy (cây node) ở 10 cấp và không phân biệt được null.
    /// </summary>
    public static class MiniJson
    {
        public static object Parse(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var p = new Parser(json);
            p.SkipWs();
            var v = p.ReadValue();
            p.SkipWs();
            if (!p.End) throw p.Error("thừa ký tự sau giá trị JSON");
            return v;
        }

        private sealed class Parser
        {
            private readonly string s;
            private int i;

            public Parser(string s)
            {
                this.s = s;
                // Bỏ BOM nếu có.
                if (s.Length > 0 && s[0] == '﻿') i = 1;
            }

            public bool End => i >= s.Length;

            public FormatException Error(string msg) => new FormatException($"JSON lỗi ở ký tự {i}: {msg}");

            public void SkipWs()
            {
                while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
            }

            public object ReadValue()
            {
                if (End) throw Error("hết dữ liệu");
                char c = s[i];
                switch (c)
                {
                    case '{': return ReadObject();
                    case '[': return ReadArray();
                    case '"': return ReadString();
                    case 't': Expect("true"); return true;
                    case 'f': Expect("false"); return false;
                    case 'n': Expect("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber();
                        throw Error($"ký tự lạ '{c}'");
                }
            }

            private void Expect(string word)
            {
                if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) throw Error($"cần '{word}'");
                i += word.Length;
            }

            private Dictionary<string, object> ReadObject()
            {
                var d = new Dictionary<string, object>();
                i++; // {
                SkipWs();
                if (!End && s[i] == '}') { i++; return d; }
                while (true)
                {
                    SkipWs();
                    if (End || s[i] != '"') throw Error("cần tên khoá");
                    string key = ReadString();
                    SkipWs();
                    if (End || s[i] != ':') throw Error("cần ':'");
                    i++;
                    SkipWs();
                    d[key] = ReadValue();
                    SkipWs();
                    if (End) throw Error("object chưa đóng");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw Error("cần ',' hoặc '}'");
                }
            }

            private List<object> ReadArray()
            {
                var l = new List<object>();
                i++; // [
                SkipWs();
                if (!End && s[i] == ']') { i++; return l; }
                while (true)
                {
                    SkipWs();
                    l.Add(ReadValue());
                    SkipWs();
                    if (End) throw Error("array chưa đóng");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return l; }
                    throw Error("cần ',' hoặc ']'");
                }
            }

            private string ReadString()
            {
                i++; // "
                var sb = new StringBuilder();
                while (true)
                {
                    if (End) throw Error("chuỗi chưa đóng");
                    char c = s[i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (End) throw Error("escape dở");
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw Error("\\u dở");
                            sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            i += 4;
                            break;
                        default: throw Error($"escape lạ '\\{e}'");
                    }
                }
            }

            private double ReadNumber()
            {
                int start = i;
                if (s[i] == '-') i++;
                while (i < s.Length)
                {
                    char c = s[i];
                    if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i++;
                    else break;
                }
                string num = s.Substring(start, i - start);
                if (!double.TryParse(num, NumberStyles.Float, CultureInfo.InvariantCulture, out double v))
                    throw Error($"số lỗi '{num}'");
                return v;
            }
        }
    }
}
