import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {createBudgetCommands} from './budgetCommands.js'
import {createBudgetManager, InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded} from './budgetManager.js'

const CLOCK = () => new Date('2026-07-15T00:00:00Z')

const createEvents = () => {
    const emitted = {instanceBudget: [], storageSpending: [], storageQuota: []}
    return {
        emitted,
        emitUserInstanceBudgetExceeded: dto => emitted.instanceBudget.push(dto),
        emitUserStorageSpendingExceeded: dto => emitted.storageSpending.push(dto),
        emitUserStorageQuotaExceeded: dto => emitted.storageQuota.push(dto),
    }
}

const pricing = {
    hourlyCostByInstanceType: () => ({'m5.large': 1}),
    storageCostPerGbMonth: 0.33,
}

const userClientOf = (...usernames) => ({
    eachUsername: async fn => {
        for (const username of usernames)
            await fn(username)
    },
})

const createFakeRepo = ({budgets = {}, defaultBudget, instanceUses = {}, storageRows = {}, pendingRequests = {}} = {}) => {
    const calls = {updateBudget: [], updateDefaultBudget: [], requestBudgetUpdate: [], saveSpendingReport: [], updateSpendingReport: [], updateUserStorageUse: []}
    return {
        calls,
        userBudget: async username =>
            budgets[username] ?? defaultBudget ?? {instanceSpending: 0, storageSpending: 0, storageQuota: 0},
        userInstanceUses: async username => instanceUses[username] ?? [],
        lastUserStorageUse: async username =>
            storageRows[username] ?? {gbHours: 0, gb: 0, updateTime: CLOCK()},
        budgetUpdateRequest: async username => pendingRequests[username] ?? null,
        updateBudget: async (username, budget) => calls.updateBudget.push({username, budget}),
        updateDefaultBudget: async budget => calls.updateDefaultBudget.push(budget),
        requestBudgetUpdate: async (username, message, budget) => calls.requestBudgetUpdate.push({username, message, budget}),
        saveSpendingReport: async report => calls.saveSpendingReport.push(report),
        updateSpendingReport: async (username, report) => calls.updateSpendingReport.push({username, report}),
        updateUserStorageUse: async (username, storageUse) => calls.updateUserStorageUse.push({username, storageUse}),
        spendingReport: async () => ({cached: {username: 'cached', instanceSpending: 1}}),
    }
}

const oneDayInJuly = () => [{
    instanceType: 'm5.large',
    from: new Date('2026-07-01T00:00:00Z'),
    to: new Date('2026-07-02T00:00:00Z'),
}] // 24 hours → $24 at $1/h

describe('BudgetManager.check', () => {
    test('passes (resolves) when under both instance and storage budget', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 100, storageQuota: 100}},
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        assert.equal(await mgr.check('u'), undefined)
        assert.equal(events.emitted.instanceBudget.length, 0)
        assert.equal(events.emitted.storageSpending.length, 0)
        assert.equal(events.emitted.storageQuota.length, 0)
    })

    test('throws InstanceBudgetExceeded when instance spending >= budget and does NOT check storage', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 24, storageSpending: 0, storageQuota: 0}}, // spending 24 >= 24
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await assert.rejects(mgr.check('u'), InstanceBudgetExceeded)
        assert.equal(events.emitted.instanceBudget.length, 1)
        assert.equal(events.emitted.storageSpending.length, 0)
        assert.equal(events.emitted.storageQuota.length, 0)
    })

    test('throws StorageBudgetExceeded when storage spending >= budget (instance under budget)', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 0, storageQuota: 1e9}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 1000, gb: 10, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await assert.rejects(mgr.check('u'), StorageBudgetExceeded)
        assert.equal(events.emitted.instanceBudget.length, 0)
        assert.equal(events.emitted.storageSpending.length, 1)
    })

    test('throws StorageQuotaExceeded when use > quota (strict), storage budget not exceeded', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 10}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}}, // use 11 > quota 10
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await assert.rejects(mgr.check('u'), StorageQuotaExceeded)
        assert.equal(events.emitted.storageQuota.length, 1)
    })

    test('quota threshold is STRICT: use == quota does NOT throw', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 11}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}}, // use 11 == quota 11
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        assert.equal(await mgr.check('u'), undefined)
        assert.equal(events.emitted.storageQuota.length, 0)
    })
})

describe('BudgetManager.verdict', () => {
    test('under both budgets → {exceeded: false, reason: null}', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 100, storageQuota: 100}},
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        assert.deepEqual(await mgr.verdict('u'), {username: 'u', exceeded: false, reason: null})
    })

    test('instance spending >= budget → INSTANCE_BUDGET, storage never evaluated', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 24, storageSpending: 0, storageQuota: 0}},
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        assert.deepEqual(
            await mgr.verdict('u'),
            {username: 'u', exceeded: true, reason: 'INSTANCE_BUDGET'}
        )
        // Short-circuits like check(): storage checks must not have run.
        assert.equal(events.emitted.storageSpending.length, 0)
        assert.equal(events.emitted.storageQuota.length, 0)
    })

    test('storage spending >= budget → STORAGE_BUDGET', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 0, storageQuota: 1e9}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 1000, gb: 10, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        assert.deepEqual(
            await mgr.verdict('u'),
            {username: 'u', exceeded: true, reason: 'STORAGE_BUDGET'}
        )
    })

    test('use > quota → STORAGE_QUOTA', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 10}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        assert.deepEqual(
            await mgr.verdict('u'),
            {username: 'u', exceeded: true, reason: 'STORAGE_QUOTA'}
        )
    })

    test('check() throws the error matching verdict()\'s reason — one shared decision path', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 10}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        const {reason} = await mgr.verdict('u')
        assert.equal(reason, 'STORAGE_QUOTA')
        await assert.rejects(mgr.check('u'), StorageQuotaExceeded)
    })
})

describe('BudgetManager.userSpending', () => {
    test('returns the exact 8-field Spending shape from the live compute', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 50, storageSpending: 20, storageQuota: 30}},
            instanceUses: {u: oneDayInJuly()}, // $24
            storageRows: {u: {gbHours: 0, gb: 7, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        const spending = await mgr.userSpending('u')
        assert.deepEqual(Object.keys(spending).sort(), [
            'budgetUpdateRequest', 'costPerGbMonth', 'monthlyInstanceBudget', 'monthlyInstanceSpending',
            'monthlyStorageBudget', 'monthlyStorageSpending', 'storageQuota', 'storageUsed',
        ])
        assert.equal(spending.monthlyInstanceBudget, 50)
        assert.equal(spending.monthlyInstanceSpending, 24)
        assert.equal(spending.monthlyStorageBudget, 20)
        assert.equal(spending.storageQuota, 30)
        assert.equal(spending.storageUsed, 7)
        assert.equal(spending.costPerGbMonth, 0.33)
        assert.equal(spending.budgetUpdateRequest, null)
    })

    test('passes budgetUpdateRequest through when present', async () => {
        const request = {message: 'more please', instanceSpending: 100, storageSpending: 50, storageQuota: 40, creationTime: CLOCK(), updateTime: CLOCK()}
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}},
            pendingRequests: {u: request},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        const spending = await mgr.userSpending('u')
        assert.deepEqual(spending.budgetUpdateRequest, request)
    })
})

describe('BudgetManager.usersExceedingBudget', () => {
    test('iterates all users, collects exceeded ones, and emits the budget.* events (same path as check)', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {
                over_instance: {instanceSpending: 24, storageSpending: 1e9, storageQuota: 1e9}, // instance >= budget
                over_storage_quota: {instanceSpending: 1e9, storageSpending: 1e9, storageQuota: 5}, // use 11 > 5
                ok: {instanceSpending: 1e9, storageSpending: 1e9, storageQuota: 1e9},
            },
            instanceUses: {over_instance: oneDayInJuly()},
            storageRows: {
                over_storage_quota: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')},
            },
        })
        const mgr = createBudgetManager({
            repo, pricing,
            userClient: userClientOf('over_instance', 'over_storage_quota', 'ok'),
            events, clock: CLOCK,
        })
        const exceeding = await mgr.usersExceedingBudget()
        assert.deepEqual(exceeding.sort(), ['over_instance', 'over_storage_quota'])
        assert.deepEqual(events.emitted.instanceBudget.map(d => d.username), ['over_instance'])
        assert.deepEqual(events.emitted.storageQuota.map(d => d.username), ['over_storage_quota'])
    })
})

describe('budget commands', () => {
    const mk = repo => createBudgetCommands({repo, hostingService: pricing, userClient: userClientOf(), events: createEvents(), clock: CLOCK})

    test('updateBudget with username → repo.updateBudget (closes pending request)', async () => {
        const repo = createFakeRepo()
        await mk(repo).updateBudget({username: 'u', budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3}})
        assert.deepEqual(
            repo.calls.updateBudget,
            [{username: 'u', budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3}}]
        )
        assert.equal(repo.calls.updateDefaultBudget.length, 0)
    })

    test('updateBudget without username → repo.updateDefaultBudget', async () => {
        const repo = createFakeRepo()
        await mk(repo).updateBudget({budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3}})
        assert.deepEqual(
            repo.calls.updateDefaultBudget,
            [{instanceSpending: 1, storageSpending: 2, storageQuota: 3}]
        )
        assert.equal(repo.calls.updateBudget.length, 0)
    })

    test('requestBudgetUpdate → repo.requestBudgetUpdate upsert', async () => {
        const repo = createFakeRepo()
        await mk(repo).requestBudgetUpdate({username: 'u', message: 'hi', budget: {instanceSpending: 9, storageSpending: 8, storageQuota: 7}})
        assert.deepEqual(
            repo.calls.requestBudgetUpdate,
            [{username: 'u', message: 'hi', budget: {instanceSpending: 9, storageSpending: 8, storageQuota: 7}}]
        )
    })

    test('updateUserSpendingReport → live report → repo.updateSpendingReport, returns report', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 5, storageSpending: 6, storageQuota: 7}},
            instanceUses: {u: oneDayInJuly()},
        })
        const report = await mk(repo).updateUserSpendingReport('u')
        assert.equal(report.username, 'u')
        assert.equal(report.instanceSpending, 24)
        assert.equal(repo.calls.updateSpendingReport.length, 1)
        assert.equal(repo.calls.updateSpendingReport[0].username, 'u')
    })

    test('updateSpendingReport → full rebuild → repo.saveSpendingReport with a report per user', async () => {
        const repo = createFakeRepo({budgets: {a: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}, b: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}}})
        const commands = createBudgetCommands({repo, hostingService: pricing, userClient: userClientOf('a', 'b'), events: createEvents(), clock: CLOCK})
        await commands.updateSpendingReport()
        assert.equal(repo.calls.saveSpendingReport.length, 1)
        assert.deepEqual(Object.keys(repo.calls.saveSpendingReport[0]).sort(), ['a', 'b'])
    })

    test('updateUserStorageUsage → storageUseService upsert (repo.updateUserStorageUse)', async () => {
        const repo = createFakeRepo()
        await mk(repo).updateUserStorageUsage('u', 12)
        assert.equal(repo.calls.updateUserStorageUse.length, 1)
        assert.equal(repo.calls.updateUserStorageUse[0].username, 'u')
        assert.equal(repo.calls.updateUserStorageUse[0].storageUse.gb, 12)
    })

    test('loadSpendingReport → repo.spendingReport (from cache)', async () => {
        const repo = createFakeRepo()
        const report = await mk(repo).loadSpendingReport()
        assert.deepEqual(report, {cached: {username: 'cached', instanceSpending: 1}})
    })
})
