import { deleteDB, openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

/** 資料庫名稱與版本（schema.dbml：ochema、版本 1）。 */
export const DB_NAME = 'ochema'
export const DB_VERSION = 1
/** object store 名稱＝DBML 表名 */
export const STORE_RECORDS = 'vehicle_records'

let dbPromise: Promise<IDBPDatabase> | null = null

/** 單例＋blocked／blocking 處理（沿用 BloomIn）。 */
export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    const opening = openDB(DB_NAME, DB_VERSION, {
      // 增量建立，只做 create、不清除既有資料（offline-use：更新後資料仍在）
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const s = db.createObjectStore(STORE_RECORDS, { keyPath: 'id', autoIncrement: true })
          s.createIndex('uq_vehicle_records_row', ['headPlate', 'tailPlate', 'ownerName', 'idNumber'], { unique: true })
          s.createIndex('idx_vehicle_records_head_plate', 'headPlate')
          s.createIndex('idx_vehicle_records_tail_plate', 'tailPlate')
          s.createIndex('idx_vehicle_records_id_number', 'idNumber')
        }
      },
      // 另一個分頁要升級或刪除時，讓出連線，並讓下次 getDb() 重新開啟
      blocking() {
        void opening.then((db) => db.close())
        if (dbPromise === opening) dbPromise = null
      },
      terminated() {
        if (dbPromise === opening) dbPromise = null
      },
    })
    opening.catch(() => {
      if (dbPromise === opening) dbPromise = null
    })
    dbPromise = opening
  }
  return dbPromise
}

/** 測試用：只關閉連線並清掉單例，不刪資料。 */
export async function closeDbForTest(): Promise<void> {
  const opening = dbPromise
  dbPromise = null
  if (opening) (await opening.catch(() => null))?.close()
}

/** 測試用：先 close 再 deleteDatabase 並清掉單例，下一次 getDb() 會得到全新的空資料庫。 */
export async function resetDbForTest(): Promise<void> {
  await closeDbForTest()
  await deleteDB(DB_NAME)
}
