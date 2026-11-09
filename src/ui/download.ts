/** 觸發下載的一份檔案；以可注入的函式交給測試攔截（正式實作用 Blob + <a download>）。 */
export interface DownloadedFile {
  fileName: string
  mimeType: string
  bytes: Uint8Array
}
export type DownloadFn = (file: DownloadedFile) => void | Promise<void>

/** 預設下載：Blob + <a download>。物件網址在稍後釋放，讓瀏覽器有時間開始下載。 */
export const browserDownload: DownloadFn = (file) => {
  const blob = new Blob([file.bytes as BlobPart], { type: file.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.fileName
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
