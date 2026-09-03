import {storageUse} from './dto.js'
import {
    calculateSpending,
    determineCurrentStorageUse,
    storageUseForThisMonth,
    updateStorageUseForThisMonth,
} from './storageUseService.js'

const d = iso => new Date(iso)

describe('determineCurrentStorageUse — trapezoidal accumulator', () => {
    test('same-month: initialGbHours retained, increment = avg × hours', () => {
        const last = storageUse({gbHours: 5, gb: 10, updateTime: d('2026-07-10T00:00:00Z')})
        const now = d('2026-07-10T10:00:00Z') // 10 hours later
        const result = determineCurrentStorageUse(last, 20, now)
        expect(result).toEqual({gbHours: 155, gb: 20, updateTime: now})
    })

    test('MONTHLY RESET: last.updateTime in prior month → initialGbHours 0', () => {
        const last = storageUse({gbHours: 99, gb: 10, updateTime: d('2026-06-30T00:00:00Z')})
        const now = d('2026-07-01T02:00:00Z')
        const result = determineCurrentStorageUse(last, 20, now)
        expect(result).toEqual({gbHours: 30, gb: 20, updateTime: now})
    })

    test('first-of-month clamp: last.updateTime before firstOfMonth → hours counted from firstOfMonth', () => {
        const last = storageUse({gbHours: 1000, gb: 8, updateTime: d('2026-06-20T00:00:00Z')})
        const now = d('2026-07-03T00:00:00Z')
        const result = determineCurrentStorageUse(last, 8, now)
        expect(result).toEqual({gbHours: 384, gb: 8, updateTime: now})
    })

    test('no-prior-row null default: gbHours 0, gb 0, updateTime now → increment 0', () => {
        const now = d('2026-07-10T00:00:00Z')
        const result = determineCurrentStorageUse(null, 10, now)
        expect(result).toEqual({gbHours: 0, gb: 10, updateTime: now})
    })
})

describe('calculateSpending — gbHours × cost / daysInMonth / 24', () => {
    test('July 2026 (31 days), gbHours 100, cost 0.33', () => {
        const now = d('2026-07-15T00:00:00Z')
        const use = storageUse({gbHours: 100, gb: 0, updateTime: now})
        expect(calculateSpending(use, 0.33, now)).toBe(100 * 0.33 / 31 / 24)
        expect(calculateSpending(use, 0.33, now)).toBeCloseTo(0.0443548, 7)
    })

    test('February 2027 (28 days) — daysInMonth resolves per month', () => {
        const now = d('2027-02-15T00:00:00Z')
        const use = storageUse({gbHours: 100, gb: 0, updateTime: now})
        expect(calculateSpending(use, 0.33, now)).toBe(100 * 0.33 / 28 / 24)
    })
})

describe('updateStorageUseForThisMonth — loads last, accumulates, persists, returns', () => {
    test('persists the accumulated StorageUse and returns it', async () => {
        const last = storageUse({gbHours: 5, gb: 10, updateTime: d('2026-07-10T00:00:00Z')})
        const now = d('2026-07-10T10:00:00Z')
        let saved = null
        const repo = {
            lastUserStorageUse: async () => last,
            updateUserStorageUse: async (username, use) => {
                saved = {username, use}
            },
        }
        const result = await updateStorageUseForThisMonth(repo, 'alice', 20, now)
        expect(result).toEqual({gbHours: 155, gb: 20, updateTime: now})
        expect(saved).toEqual({username: 'alice', use: {gbHours: 155, gb: 20, updateTime: now}})
    })
})

describe('storageUseForThisMonth — uses last.gb as gbUsed, does not persist', () => {
    test('same month: gbUsed = last.gb', async () => {
        const last = storageUse({gbHours: 5, gb: 10, updateTime: d('2026-07-10T00:00:00Z')})
        const now = d('2026-07-10T10:00:00Z')
        let persisted = false
        const repo = {
            lastUserStorageUse: async () => last,
            updateUserStorageUse: async () => {
                persisted = true
            },
        }
        const result = await storageUseForThisMonth(repo, 'alice', now)
        expect(result).toEqual({gbHours: 105, gb: 10, updateTime: now})
        expect(persisted).toBe(false)
    })
})
