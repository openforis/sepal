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
        await expect(mgr.check('u')).resolves.toBeUndefined()
        expect(events.emitted.instanceBudget).toHaveLength(0)
        expect(events.emitted.storageSpending).toHaveLength(0)
        expect(events.emitted.storageQuota).toHaveLength(0)
    })

    test('throws InstanceBudgetExceeded when instance spending >= budget and does NOT check storage', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 24, storageSpending: 0, storageQuota: 0}}, // spending 24 >= 24
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await expect(mgr.check('u')).rejects.toBeInstanceOf(InstanceBudgetExceeded)
        expect(events.emitted.instanceBudget).toHaveLength(1)
        expect(events.emitted.storageSpending).toHaveLength(0)
        expect(events.emitted.storageQuota).toHaveLength(0)
    })

    test('throws StorageBudgetExceeded when storage spending >= budget (instance under budget)', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 0, storageQuota: 1e9}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 1000, gb: 10, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await expect(mgr.check('u')).rejects.toBeInstanceOf(StorageBudgetExceeded)
        expect(events.emitted.instanceBudget).toHaveLength(0)
        expect(events.emitted.storageSpending).toHaveLength(1)
    })

    test('throws StorageQuotaExceeded when use > quota (strict), storage budget not exceeded', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 10}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}}, // use 11 > quota 10
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await expect(mgr.check('u')).rejects.toBeInstanceOf(StorageQuotaExceeded)
        expect(events.emitted.storageQuota).toHaveLength(1)
    })

    test('quota threshold is STRICT: use == quota does NOT throw', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 11}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}}, // use 11 == quota 11
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await expect(mgr.check('u')).resolves.toBeUndefined()
        expect(events.emitted.storageQuota).toHaveLength(0)
    })
})

describe('BudgetManager.verdict', () => {
    test('under both budgets → {exceeded: false, reason: null}', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 100, storageQuota: 100}},
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        await expect(mgr.verdict('u')).resolves.toEqual({username: 'u', exceeded: false, reason: null})
    })

    test('instance spending >= budget → INSTANCE_BUDGET, storage never evaluated', async () => {
        const events = createEvents()
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 24, storageSpending: 0, storageQuota: 0}},
            instanceUses: {u: oneDayInJuly()},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events, clock: CLOCK})
        await expect(mgr.verdict('u')).resolves.toEqual({username: 'u', exceeded: true, reason: 'INSTANCE_BUDGET'})
        // Short-circuits like check(): storage checks must not have run.
        expect(events.emitted.storageSpending).toHaveLength(0)
        expect(events.emitted.storageQuota).toHaveLength(0)
    })

    test('storage spending >= budget → STORAGE_BUDGET', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 0, storageQuota: 1e9}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 1000, gb: 10, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        await expect(mgr.verdict('u')).resolves.toEqual({username: 'u', exceeded: true, reason: 'STORAGE_BUDGET'})
    })

    test('use > quota → STORAGE_QUOTA', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 10}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        await expect(mgr.verdict('u')).resolves.toEqual({username: 'u', exceeded: true, reason: 'STORAGE_QUOTA'})
    })

    test('check() throws the error matching verdict()\'s reason — one shared decision path', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 100, storageSpending: 1e9, storageQuota: 10}},
            instanceUses: {u: []},
            storageRows: {u: {gbHours: 0, gb: 11, updateTime: new Date('2026-07-14T00:00:00Z')}},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        const {reason} = await mgr.verdict('u')
        expect(reason).toBe('STORAGE_QUOTA')
        await expect(mgr.check('u')).rejects.toBeInstanceOf(StorageQuotaExceeded)
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
        expect(Object.keys(spending).sort()).toEqual([
            'budgetUpdateRequest', 'costPerGbMonth', 'monthlyInstanceBudget', 'monthlyInstanceSpending',
            'monthlyStorageBudget', 'monthlyStorageSpending', 'storageQuota', 'storageUsed',
        ])
        expect(spending.monthlyInstanceBudget).toBe(50)
        expect(spending.monthlyInstanceSpending).toBe(24)
        expect(spending.monthlyStorageBudget).toBe(20)
        expect(spending.storageQuota).toBe(30)
        expect(spending.storageUsed).toBe(7)
        expect(spending.costPerGbMonth).toBe(0.33)
        expect(spending.budgetUpdateRequest).toBeNull()
    })

    test('passes budgetUpdateRequest through when present', async () => {
        const request = {message: 'more please', instanceSpending: 100, storageSpending: 50, storageQuota: 40, creationTime: CLOCK(), updateTime: CLOCK()}
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}},
            pendingRequests: {u: request},
        })
        const mgr = createBudgetManager({repo, pricing, userClient: userClientOf('u'), events: createEvents(), clock: CLOCK})
        const spending = await mgr.userSpending('u')
        expect(spending.budgetUpdateRequest).toEqual(request)
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
        expect(exceeding.sort()).toEqual(['over_instance', 'over_storage_quota'])
        expect(events.emitted.instanceBudget.map(d => d.username)).toEqual(['over_instance'])
        expect(events.emitted.storageQuota.map(d => d.username)).toEqual(['over_storage_quota'])
    })
})

describe('budget commands', () => {
    const mk = repo => createBudgetCommands({repo, hostingService: pricing, userClient: userClientOf(), events: createEvents(), clock: CLOCK})

    test('updateBudget with username → repo.updateBudget (closes pending request)', async () => {
        const repo = createFakeRepo()
        await mk(repo).updateBudget({username: 'u', budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3}})
        expect(repo.calls.updateBudget).toEqual([{username: 'u', budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3}}])
        expect(repo.calls.updateDefaultBudget).toHaveLength(0)
    })

    test('updateBudget without username → repo.updateDefaultBudget', async () => {
        const repo = createFakeRepo()
        await mk(repo).updateBudget({budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3}})
        expect(repo.calls.updateDefaultBudget).toEqual([{instanceSpending: 1, storageSpending: 2, storageQuota: 3}])
        expect(repo.calls.updateBudget).toHaveLength(0)
    })

    test('requestBudgetUpdate → repo.requestBudgetUpdate upsert', async () => {
        const repo = createFakeRepo()
        await mk(repo).requestBudgetUpdate({username: 'u', message: 'hi', budget: {instanceSpending: 9, storageSpending: 8, storageQuota: 7}})
        expect(repo.calls.requestBudgetUpdate).toEqual([{username: 'u', message: 'hi', budget: {instanceSpending: 9, storageSpending: 8, storageQuota: 7}}])
    })

    test('updateUserSpendingReport → live report → repo.updateSpendingReport, returns report', async () => {
        const repo = createFakeRepo({
            budgets: {u: {instanceSpending: 5, storageSpending: 6, storageQuota: 7}},
            instanceUses: {u: oneDayInJuly()},
        })
        const report = await mk(repo).updateUserSpendingReport('u')
        expect(report.username).toBe('u')
        expect(report.instanceSpending).toBe(24)
        expect(repo.calls.updateSpendingReport).toHaveLength(1)
        expect(repo.calls.updateSpendingReport[0].username).toBe('u')
    })

    test('updateSpendingReport → full rebuild → repo.saveSpendingReport with a report per user', async () => {
        const repo = createFakeRepo({budgets: {a: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}, b: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}}})
        const commands = createBudgetCommands({repo, hostingService: pricing, userClient: userClientOf('a', 'b'), events: createEvents(), clock: CLOCK})
        await commands.updateSpendingReport()
        expect(repo.calls.saveSpendingReport).toHaveLength(1)
        expect(Object.keys(repo.calls.saveSpendingReport[0]).sort()).toEqual(['a', 'b'])
    })

    test('updateUserStorageUsage → storageUseService upsert (repo.updateUserStorageUse)', async () => {
        const repo = createFakeRepo()
        await mk(repo).updateUserStorageUsage('u', 12)
        expect(repo.calls.updateUserStorageUse).toHaveLength(1)
        expect(repo.calls.updateUserStorageUse[0].username).toBe('u')
        expect(repo.calls.updateUserStorageUse[0].storageUse.gb).toBe(12)
    })

    test('loadSpendingReport → repo.spendingReport (from cache)', async () => {
        const repo = createFakeRepo()
        const report = await mk(repo).loadSpendingReport()
        expect(report).toEqual({cached: {username: 'cached', instanceSpending: 1}})
    })
})
