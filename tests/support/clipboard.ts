/** 可控的假剪貼簿：記錄 writeText 的內容；reject 時模擬裝置不允許寫入。jsdom 預設沒有 navigator.clipboard。 */
export class FakeClipboard {
  readonly writes: string[] = []
  reject = false
  private original?: PropertyDescriptor
  private installed = false

  /** 取代 navigator.clipboard。必須在 userEvent.setup() 之後呼叫（setup 會放自己的替身）。 */
  install() {
    if (!this.installed) {
      this.original = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard')
      this.installed = true
    }
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          if (this.reject) return Promise.reject(new DOMException('不允許寫入剪貼簿', 'NotAllowedError'))
          this.writes.push(text)
          return Promise.resolve()
        },
      },
    })
  }

  uninstall() {
    if (!this.installed) return
    if (this.original) Object.defineProperty(window.navigator, 'clipboard', this.original)
    else delete (window.navigator as { clipboard?: unknown }).clipboard
    this.installed = false
  }
}
