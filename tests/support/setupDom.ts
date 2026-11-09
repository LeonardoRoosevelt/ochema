import 'fake-indexeddb/auto'

/*
 * jsdom 環境的補丁，只補「jsdom 沒有、但真實瀏覽器一定有」的能力（沿用 BloomIn 的 setupDom）。
 * 刻意不替換 Blob/File：UI 選檔用 FileReader 讀 jsdom 的 File，換成 Node 的 File 反而會讀不到。
 */

// jsdom 沒有實作 <dialog> 的 showModal/close；刪除確認等對話框依賴它們開關。
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.open = false
}

// 主題切換（跟隨系統）會呼叫 matchMedia；jsdom 沒有。
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

// 注意：不在這裡註冊 afterEach(cleanup)。vitest-cucumber 把每個 step 當成一個 test，
// 全域 afterEach 會在每個 step 之後卸載畫面；畫面的清理改由 World.dispose()（每個情境結束時）負責。
