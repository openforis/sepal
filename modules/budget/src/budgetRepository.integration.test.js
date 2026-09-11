import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {BudgetRepository} from './budgetRepository.js'
import {budget, storageUse, userSpendingReport} from './dto.js'
import {OpenSessionUseRepository} from './openSessionUse.js'

// Direct SQL appears only where a public read cannot show what was stored: the initial and final figures
// of a budget request, and whether a write replaced a row or added one.

describe('BudgetRepository', () => {
    let testDb
    let repository
    let sessionUse
    let now

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'budget_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2026-06-15T12:00:00Z')
        repository = new BudgetRepository(testDb.db, () => now)
        sessionUse = new OpenSessionUseRepository(testDb.db)
    })

    afterAll(() => testDb?.remove())

    describe('userBudget', () => {
        test('falls back to the default budget when the user has none', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 20, storageQuota: 30}))

            const found = await repository.userBudget(OWNER)

            expect(found).toEqual({instanceSpending: 1, storageSpending: 20, storageQuota: 30})
        })

        test('prefers the user\'s own budget over the default', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 20, storageQuota: 30}))
            await repository.updateBudget(OWNER, budget({instanceSpending: 5, storageSpending: 50, storageQuota: 500}))

            const found = await repository.userBudget(OWNER)

            expect(found).toEqual({instanceSpending: 5, storageSpending: 50, storageQuota: 500})
        })
    })

    describe('userInstanceUses', () => {
        test('ends a closed use at its close time and an open one at the current time', async () => {
            await givenUse('closed', {from: at('06-02'), to: at('06-03')})
            await givenUse('open', {from: at('06-04')})

            const uses = await repository.userInstanceUses(OWNER, 2026, 6)

            const closed = uses.find(use => use.from.getTime() === at('06-02').getTime())
            const open = uses.find(use => use.from.getTime() === at('06-04').getTime())
            expect(closed.to.getTime()).toBe(at('06-03').getTime())
            expect(open.to.getTime()).toBe(now.getTime())
        })

        test('returns only the uses overlapping the requested month', async () => {
            await givenUse('may', {from: at('05-10'), to: at('05-11')})
            await givenUse('june', {from: at('06-10'), to: at('06-11')})
            await givenUse('spanning', {from: at('05-28'), to: at('06-02')})

            const april = await fromTimes(2026, 4)
            const may = await fromTimes(2026, 5)
            const june = await fromTimes(2026, 6)
            const december = await fromTimes(2026, 12)

            expect(april).toEqual([])
            expect(may).toEqual(isoTimes(at('05-10'), at('05-28')))
            expect(june).toEqual(isoTimes(at('05-28'), at('06-10')))
            expect(december).toEqual([])
        })

        test('counts a use that is still open from its first month onwards', async () => {
            await givenUse('open', {from: at('05-10')})

            const april = await repository.userInstanceUses(OWNER, 2026, 4)
            const may = await repository.userInstanceUses(OWNER, 2026, 5)
            const june = await repository.userInstanceUses(OWNER, 2026, 6)

            expect(april).toHaveLength(0)
            expect(may).toHaveLength(1)
            expect(june).toHaveLength(1)
        })

        test('returns only the given user\'s uses', async () => {
            await givenUse('owned', {from: at('06-01'), to: at('06-02')})
            await givenUse('another', {username: ANOTHER_OWNER, from: at('06-01'), to: at('06-02')})

            const uses = await repository.userInstanceUses(OWNER, 2026, 6)

            expect(uses).toHaveLength(1)
            expect(uses[0].instanceType).toBe(INSTANCE_TYPE)
        })
    })

    describe('storage use', () => {
        test('reports nothing used, as of now, for a month with nothing recorded', async () => {
            const use = await repository.userStorageUse(OWNER, 2026, 6)

            expect(use.gbHours).toBe(0)
            expect(use.gb).toBe(0)
            expect(use.updateTime.getTime()).toBe(now.getTime())
        })

        test('records the figure under the month its update time falls in', async () => {
            await repository.updateUserStorageUse(OWNER, storageUse({gbHours: 12, gb: 3, updateTime: at('06-10')}))

            const use = await repository.userStorageUse(OWNER, 2026, 6)

            expect(use.gbHours).toBe(12)
            expect(use.gb).toBe(3)
            expect(use.updateTime.getTime()).toBe(at('06-10').getTime())
        })

        test('replaces the figure already recorded for that month', async () => {
            await repository.updateUserStorageUse(OWNER, storageUse({gbHours: 12, gb: 3, updateTime: at('06-10')}))

            await repository.updateUserStorageUse(OWNER, storageUse({gbHours: 30, gb: 5, updateTime: at('06-20')}))

            const use = await repository.userStorageUse(OWNER, 2026, 6)
            const [rows] = await testDb.query('SELECT COUNT(*) c FROM user_monthly_storage')
            expect(use.gbHours).toBe(30)
            expect(use.gb).toBe(5)
            expect(use.updateTime.getTime()).toBe(at('06-20').getTime())
            expect(rows[0].c).toBe(1)
        })

        test('reports the most recent month recorded', async () => {
            await repository.updateUserStorageUse(OWNER, storageUse({gbHours: 1, gb: 1, updateTime: at('05-10')}))
            await repository.updateUserStorageUse(OWNER, storageUse({gbHours: 2, gb: 2, updateTime: at('06-10')}))

            const use = await repository.lastUserStorageUse(OWNER)

            expect(use.gbHours).toBe(2)
        })
    })

    describe('spending', () => {
        test('replaces the whole report, dropping users it no longer names', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 10, storageQuota: 100}))
            await repository.saveSpendingReport({
                stale: spending({username: 'stale', instanceSpending: 9, storageSpending: 9, storageUsage: 9}),
            })

            await repository.saveSpendingReport({
                [OWNER]: spending({username: OWNER, instanceSpending: 1, storageSpending: 2, storageUsage: 3}),
                [ANOTHER_OWNER]: spending({username: ANOTHER_OWNER, instanceSpending: 4, storageSpending: 5, storageUsage: 6}),
            })

            const report = await repository.spendingReport()
            expect(Object.keys(report).sort()).toEqual([OWNER, ANOTHER_OWNER])
            expect(report[OWNER].instanceSpending).toBe(1)
            expect(report[ANOTHER_OWNER].storageUsage).toBe(6)
        })

        test('updates a user already in the report and adds nobody', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 10, storageQuota: 100}))
            await repository.saveSpendingReport({
                [OWNER]: spending({username: OWNER, instanceSpending: 0, storageSpending: 0, storageUsage: 0}),
            })

            await repository.updateSpendingReport(OWNER, spending({username: OWNER, instanceSpending: 9, storageSpending: 8, storageUsage: 7}))
            await repository.updateSpendingReport('ghost', spending({username: 'ghost', instanceSpending: 1, storageSpending: 1, storageUsage: 1}))

            const report = await repository.spendingReport()
            expect(Object.keys(report)).toEqual([OWNER])
            expect(report[OWNER].instanceSpending).toBe(9)
            expect(report[OWNER].storageUsage).toBe(7)
        })

        test('reports everyone known to spending, budgets or requests, with their effective budget and pending request', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 10, storageQuota: 100}))
            await repository.saveSpendingReport({
                [OWNER]: spending({username: OWNER, instanceSpending: 3, storageSpending: 4, storageUsage: 5}),
            })
            await repository.updateBudget(OWNER, budget({instanceSpending: 7, storageSpending: 70, storageQuota: 700}))
            await repository.requestBudgetUpdate(ANOTHER_OWNER, 'more', budget({instanceSpending: 2, storageSpending: 2, storageQuota: 2}))

            const report = await repository.spendingReport()

            expect(Object.keys(report).sort()).toEqual([OWNER, ANOTHER_OWNER])
            expect(report[OWNER].instanceSpending).toBe(3)
            expect(report[OWNER].instanceBudget).toBe(7)
            expect(report[OWNER].storageQuota).toBe(700)
            expect(report[OWNER].budgetUpdateRequest).toBeUndefined()
            expect(report[OWNER].costPerGbMonth).toBe(0)
            expect(report[ANOTHER_OWNER].costPerGbMonth).toBe(0)
            expect(report[ANOTHER_OWNER].instanceSpending).toBe(0)
            expect(report[ANOTHER_OWNER].instanceBudget).toBe(1)
            expect(report[ANOTHER_OWNER].storageQuota).toBe(100)
            expect(report[ANOTHER_OWNER].budgetUpdateRequest.message).toBe('more')
        })
    })

    describe('budget update requests', () => {
        // The figures a request was opened against, and the ones it was granted, are kept for the record
        // and never read back by the DTO.
        test('records the budget in force when the request was made', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 1, storageQuota: 1}))
            await repository.updateBudget(OWNER, budget({instanceSpending: 5, storageSpending: 50, storageQuota: 500}))

            await repository.requestBudgetUpdate(OWNER, 'please more',
                budget({instanceSpending: 10, storageSpending: 100, storageQuota: 1000}))

            const rows = await storedRequests(OWNER)
            expect(rows).toHaveLength(1)
            expect(rows[0].state).toBe('PENDING')
            expect(rows[0].initial_monthly_instance).toBe(5)
            expect(rows[0].initial_storage_quota).toBe(500)
            expect(rows[0].requested_monthly_instance).toBe(10)
            expect(rows[0].message).toBe('please more')
        })

        test('replaces a pending request rather than adding a second', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 1, storageQuota: 1}))
            await repository.requestBudgetUpdate(OWNER, 'first', budget({instanceSpending: 2, storageSpending: 2, storageQuota: 2}))

            await repository.requestBudgetUpdate(OWNER, 'second', budget({instanceSpending: 9, storageSpending: 9, storageQuota: 9}))

            const rows = await storedRequests(OWNER)
            expect(rows).toHaveLength(1)
            expect(rows[0].message).toBe('second')
            expect(rows[0].requested_monthly_instance).toBe(9)
        })

        test('reports the pending request', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 1, storageQuota: 1}))
            await repository.requestBudgetUpdate(OWNER, 'give me', budget({instanceSpending: 7, storageSpending: 8, storageQuota: 9}))

            const request = await repository.budgetUpdateRequest(OWNER)

            expect(request.message).toBe('give me')
            expect(request.instanceSpending).toBe(7)
            expect(request.storageQuota).toBe(9)
        })

        test('reports no pending request when there is none', async () => {
            const request = await repository.budgetUpdateRequest('nobody')

            expect(request).toBeNull()
        })

        test('applies the new budget and closes the pending request with the granted figures', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 1, storageQuota: 1}))
            await repository.requestBudgetUpdate(OWNER, 'want', budget({instanceSpending: 9, storageSpending: 9, storageQuota: 9}))

            await repository.updateBudget(OWNER, budget({instanceSpending: 6, storageSpending: 60, storageQuota: 600}))

            const applied = await repository.userBudget(OWNER)
            const rows = await storedRequests(OWNER)
            const pending = await repository.budgetUpdateRequest(OWNER)
            expect(applied).toEqual({instanceSpending: 6, storageSpending: 60, storageQuota: 600})
            expect(rows[0].state).toBe('CLOSED')
            expect(rows[0].final_monthly_instance).toBe(6)
            expect(rows[0].final_storage_quota).toBe(600)
            expect(pending).toBeNull()
        })
    })

    describe('updateDefaultBudget', () => {
        test('keeps the default budget as a single row', async () => {
            await repository.updateDefaultBudget(budget({instanceSpending: 1, storageSpending: 2, storageQuota: 3}))

            await repository.updateDefaultBudget(budget({instanceSpending: 10, storageSpending: 20, storageQuota: 30}))

            const found = await repository.userBudget('nobody')
            const [rows] = await testDb.query('SELECT COUNT(*) c FROM default_user_budget')
            expect(found).toEqual({instanceSpending: 10, storageSpending: 20, storageQuota: 30})
            expect(rows[0].c).toBe(1)
        })
    })

    const givenUse = async (sessionId, {username = OWNER, from, to = null}) => {
        await sessionUse.openSession({sessionId, username, instanceType: INSTANCE_TYPE, from})
        if (to) {
            await sessionUse.closeSession({sessionId, to})
        }
    }

    const fromTimes = async (year, month) =>
        (await repository.userInstanceUses(OWNER, year, month))
            .map(use => use.from.toISOString()).sort()

    const isoTimes = (...dates) => dates.map(date => date.toISOString()).sort()

    // Only for the figures the request DTO leaves out: what the budget was when it was opened, and what
    // it became when it was granted.
    const storedRequests = async username => {
        const [rows] = await testDb.query('SELECT * FROM budget_update_request WHERE username = ?', [username])
        return rows
    }

    const spending = ({username, instanceSpending, storageSpending, storageUsage}) => userSpendingReport({
        username, instanceSpending, storageSpending, storageUsage,
        instanceBudget: 0, storageBudget: 0, storageQuota: 0, costPerGbMonth: 0,
        budgetUpdateRequest: null,
    })

    const at = monthDay => new Date(`2026-${monthDay}T00:00:00Z`)

    const OWNER = 'alice'
    const ANOTHER_OWNER = 'bob'
    const INSTANCE_TYPE = 't2.small'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
