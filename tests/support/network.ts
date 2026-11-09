/**
 * 網路防護：offline-use.feature 對「沒有網路」的定義是
 *   navigator.onLine 為 false，且所有 fetch、XMLHttpRequest、sendBeacon 一律失敗。
 * 防護一旦安裝就記錄所有呼叫（不論是否離線），供「沒有任何對外的網路請求」斷言。
 */
export class NetworkGuard {
  readonly calls: string[] = []
  private restore: Array<() => void> = []
  private installed = false

  install(): void {
    if (this.installed) return
    this.installed = true
    const g = globalThis as unknown as Record<string, unknown>

    const origFetch = g.fetch
    g.fetch = (input: unknown) => {
      this.calls.push(`fetch ${String(input instanceof Request ? input.url : input)}`)
      return Promise.reject(new TypeError('Failed to fetch（測試：不允許網路）'))
    }
    this.restore.push(() => (g.fetch = origFetch))

    const xhr = XMLHttpRequest.prototype
    const origOpen = xhr.open
    const origSend = xhr.send
    xhr.open = ((method: string, url: string | URL) => {
      this.calls.push(`xhr ${method} ${String(url)}`)
      throw new Error('XMLHttpRequest 失敗（測試：不允許網路）')
    }) as typeof xhr.open
    xhr.send = (() => {
      throw new Error('XMLHttpRequest 失敗（測試：不允許網路）')
    }) as typeof xhr.send
    this.restore.push(() => {
      xhr.open = origOpen
      xhr.send = origSend
    })

    const nav = navigator as unknown as Record<string, unknown>
    const hadBeacon = 'sendBeacon' in navigator
    const origBeacon = nav.sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: (url: string | URL) => {
        this.calls.push(`beacon ${String(url)}`)
        return false
      },
    })
    this.restore.push(() => {
      if (hadBeacon) Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: origBeacon })
      else delete nav.sendBeacon
    })
  }

  /** navigator.onLine = false */
  goOffline(): void {
    this.install()
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    this.restore.push(() => {
      delete (navigator as unknown as Record<string, unknown>).onLine
      if (desc) Object.defineProperty(Navigator.prototype, 'onLine', desc)
    })
  }

  uninstall(): void {
    for (const fn of this.restore.reverse()) fn()
    this.restore = []
    this.installed = false
  }
}
