import type { FontInfo } from './types'

/** Thông số font TMP đã biết (lấy từ TMP_FontAsset trong Unity). */
export const KNOWN_FONTS: Record<string, FontInfo> = {
  'Kanit-SemiBold': { pointSize: 64, padding: 10, normalSpacing: -5, boldSpacing: 7, kerning: false, lineHeight: 1.495 },
}

export const DEFAULT_FONT_INFO: FontInfo = { pointSize: 90, padding: 9, normalSpacing: 0, boldSpacing: 7, kerning: true }

export function fontInfoOf(map: Record<string, FontInfo> | undefined, font: string): FontInfo {
  return { ...DEFAULT_FONT_INFO, ...(KNOWN_FONTS[font] ?? KNOWN_FONTS[baseFont(font)] ?? {}), ...(map?.[font] ?? {}) }
}

/** Tên font gốc: asset biến thể như "Kanit-SemiBold Chat" dùng chung tệp font "Kanit-SemiBold". */
export function baseFont(font: string): string {
  return font.split(' ')[0]
}

/** font-family CSS: tên font, rồi tên gốc, rồi sans-serif */
export function cssFontFamily(font: string): string {
  const b = baseFont(font)
  return b !== font ? `"${font}", "${b}", sans-serif` : `"${font}", sans-serif`
}

/** Khoảng cách thêm giữa các ký tự (em) như TMP: characterSpacing + spacing offset của font theo kiểu chữ. */
export function letterSpacingEm(characterSpacing: number, bold: boolean, info: FontInfo): number {
  return (characterSpacing + (bold ? info.boldSpacing : info.normalSpacing)) / 100
}
