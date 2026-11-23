// Unity nhân màu Image.color với từng pixel sprite. CSS không có phép nhân màu cho ảnh,
// nên dựng sẵn bản ảnh đã nhân màu bằng canvas rồi cache lại.
import type { Color } from '../model/types'

const cache = new Map<string, string>()
const imgCache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<void>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = imgCache.get(url)
  if (hit?.complete) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      imgCache.set(url, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = url
  })
}

/** Trả về url đã nhân màu nếu có sẵn trong cache, chưa có thì null và bắt đầu dựng (gọi onReady khi xong). */
export function tintedUrl(url: string, c: Color, onReady: () => void): string | null {
  if (c.r >= 0.999 && c.g >= 0.999 && c.b >= 0.999) return url
  const key = `${url}|${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`
  const hit = cache.get(key)
  if (hit) return hit
  if (!pending.has(key)) {
    pending.set(
      key,
      loadImage(url)
        .then((img) => {
          const cv = document.createElement('canvas')
          cv.width = img.naturalWidth
          cv.height = img.naturalHeight
          const ctx = cv.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, cv.width, cv.height)
          const d = data.data
          for (let i = 0; i < d.length; i += 4) {
            d[i] = Math.round(d[i] * c.r)
            d[i + 1] = Math.round(d[i + 1] * c.g)
            d[i + 2] = Math.round(d[i + 2] * c.b)
          }
          ctx.putImageData(data, 0, 0)
          cache.set(key, cv.toDataURL('image/png'))
        })
        .catch(() => {
          cache.set(key, url)
        })
        .finally(() => {
          pending.delete(key)
          onReady()
        }),
    )
  } else {
    pending.get(key)!.then(onReady)
  }
  return null
}
