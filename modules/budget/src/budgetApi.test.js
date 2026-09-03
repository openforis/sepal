import {jest} from '@jest/globals'

import {createBudgetApi} from './budgetApi.js'

const makeCommands = () => ({
    loadSpendingReport: jest.fn(),
    updateBudget: jest.fn().mockResolvedValue(undefined),
    requestBudgetUpdate: jest.fn().mockResolvedValue(undefined),
})

const makeApi = (commands, userSpending = jest.fn(), verdict = jest.fn()) =>
    createBudgetApi({budgetManager: {commands, userSpending, verdict}})

const ctx = ({body = {}, currentUser = {username: 'alice', roles: []}, params = {}} = {}) => ({
    request: {body},
    state: {currentUser},
    params,
    status: undefined,
    body: undefined,
})

const reportEntry = (overrides = {}) => ({
    username: 'alice',
    instanceSpending: 1.5,
    storageSpending: 2.5,
    storageUsage: 42,
    instanceBudget: 10,
    storageBudget: 20,
    storageQuota: 100,
    costPerGbMonth: 0,
    budgetUpdateRequest: null,
    ...overrides,
})

describe('GET /budget/report serialization', () => {
    test('maps each user with the spendingAsMap shape; current.storageQuota carries storageUSAGE', async () => {
        const commands = makeCommands()
        commands.loadSpendingReport.mockResolvedValue({alice: reportEntry()})
        const c = ctx()
        await makeApi(commands).report(c)
        expect(c.body).toEqual({
            alice: {
                current: {
                    instanceSpending: 1.5,
                    storageSpending: 2.5,
                    storageQuota: 42, // ← storageUsage, NOT the quota (Groovy quirk)
                },
                budget: {
                    instanceSpending: 10,
                    storageSpending: 20,
                    storageQuota: 100, // ← the actual quota
                },
                budgetUpdateRequest: null,
            },
        })
    })

    test('budgetUpdateRequest present as an object when set', async () => {
        const commands = makeCommands()
        const request = {message: 'more please', instanceSpending: 5, storageSpending: 5, storageQuota: 5}
        commands.loadSpendingReport.mockResolvedValue({
            alice: reportEntry({budgetUpdateRequest: request}),
        })
        const c = ctx()
        await makeApi(commands).report(c)
        expect(c.body.alice.budgetUpdateRequest).toEqual(request)
    })

    test('budgetUpdateRequest normalised to null (key present, not missing) when absent', async () => {
        const commands = makeCommands()
        commands.loadSpendingReport.mockResolvedValue({
            alice: reportEntry({budgetUpdateRequest: undefined}),
        })
        const c = ctx()
        await makeApi(commands).report(c)
        expect(c.body.alice.budgetUpdateRequest).toBeNull()
        // the key must survive JSON.stringify (undefined would be dropped)
        expect(JSON.parse(JSON.stringify(c.body)).alice).toHaveProperty('budgetUpdateRequest', null)
    })

    test('empty report → empty map', async () => {
        const commands = makeCommands()
        commands.loadSpendingReport.mockResolvedValue({})
        const c = ctx()
        await makeApi(commands).report(c)
        expect(c.body).toEqual({})
    })
})

describe('POST /budget updateBudget', () => {
    test('calls updateBudget with the right budget and returns the budget triple', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: 'bob', instanceSpending: 3, storageSpending: 4, storageQuota: 5}})
        await makeApi(commands).updateBudget(c)
        expect(commands.updateBudget).toHaveBeenCalledWith({
            username: 'bob',
            budget: {instanceSpending: 3, storageSpending: 4, storageQuota: 5},
        })
        expect(c.body).toEqual({instanceSpending: 3, storageSpending: 4, storageQuota: 5})
        expect(c.status).toBeUndefined()
    })

    test('blank username → 400, updateBudget not called', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: '   ', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        expect(c.status).toBe(400)
        expect(commands.updateBudget).not.toHaveBeenCalled()
    })

    test('missing username → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        expect(c.status).toBe(400)
        expect(commands.updateBudget).not.toHaveBeenCalled()
    })

    test('negative spending → 400, updateBudget not called', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: 'bob', instanceSpending: -1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        expect(c.status).toBe(400)
        expect(commands.updateBudget).not.toHaveBeenCalled()
    })

    test('non-numeric spending → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: 'bob', instanceSpending: 'x', storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        expect(c.status).toBe(400)
        expect(commands.updateBudget).not.toHaveBeenCalled()
    })
})

describe('POST /budget/requestUpdate', () => {
    test('204; username taken from currentUser; passes message + budget', async () => {
        const commands = makeCommands()
        const c = ctx({
            body: {message: 'more', instanceSpending: 1, storageSpending: 2, storageQuota: 3},
            currentUser: {username: 'carol', roles: []},
        })
        await makeApi(commands).requestUpdate(c)
        expect(commands.requestBudgetUpdate).toHaveBeenCalledWith({
            username: 'carol',
            message: 'more',
            budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3},
        })
        expect(c.status).toBe(204)
    })

    test('blank message → 400, requestBudgetUpdate not called', async () => {
        const commands = makeCommands()
        const c = ctx({body: {message: '  ', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).requestUpdate(c)
        expect(c.status).toBe(400)
        expect(commands.requestBudgetUpdate).not.toHaveBeenCalled()
    })

    test('missing message → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).requestUpdate(c)
        expect(c.status).toBe(400)
        expect(commands.requestBudgetUpdate).not.toHaveBeenCalled()
    })

    test('negative spending → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {message: 'ok', instanceSpending: 1, storageSpending: -5, storageQuota: 1}})
        await makeApi(commands).requestUpdate(c)
        expect(c.status).toBe(400)
        expect(commands.requestBudgetUpdate).not.toHaveBeenCalled()
    })
})

describe('publishSpending notifications', () => {
    const makePublishingApi = commands => {
        const published = []
        const publishSpending = async username => published.push(username)
        const api = createBudgetApi({budgetManager: {commands, userSpending: jest.fn()}, publishSpending})
        return {api, published}
    }

    test('publishes the user\'s spending after a successful POST /budget', async () => {
        const commands = makeCommands()
        const {api, published} = makePublishingApi(commands)
        const c = ctx({body: {username: 'alice', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await api.updateBudget(c)
        expect(published).toEqual(['alice'])
    })

    test('does not publish when POST /budget validation fails', async () => {
        const commands = makeCommands()
        const {api, published} = makePublishingApi(commands)
        const c = ctx({body: {username: '', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await api.updateBudget(c)
        expect(published).toEqual([])
    })

    test('publishes the current user\'s spending after a successful POST /budget/requestUpdate', async () => {
        const commands = makeCommands()
        const {api, published} = makePublishingApi(commands)
        const c = ctx({
            body: {message: 'more please', instanceSpending: 1, storageSpending: 1, storageQuota: 1},
            currentUser: {username: 'bob', roles: []},
        })
        await api.requestUpdate(c)
        expect(published).toEqual(['bob'])
    })
})

describe('GET /budget/spending/:username', () => {
    test('returns budgetManager.userSpending(username) verbatim (the 8-field Spending DTO)', async () => {
        const commands = makeCommands()
        const spendingDto = {
            monthlyInstanceBudget: 10,
            monthlyInstanceSpending: 1.5,
            monthlyStorageBudget: 20,
            monthlyStorageSpending: 2.5,
            storageQuota: 100,
            storageUsed: 42,
            costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        }
        const userSpending = jest.fn().mockResolvedValue(spendingDto)
        const c = ctx({params: {username: 'bob'}})
        await makeApi(commands, userSpending).spending(c)
        expect(userSpending).toHaveBeenCalledWith('bob')
        expect(c.body).toEqual(spendingDto)
    })
})

describe('GET /budget/check/:username', () => {
    test('returns budgetManager.verdict(username) verbatim', async () => {
        const verdict = jest.fn().mockResolvedValue({username: 'bob', exceeded: true, reason: 'STORAGE_QUOTA'})
        const c = ctx({params: {username: 'bob'}})
        await makeApi(makeCommands(), jest.fn(), verdict).check(c)
        expect(verdict).toHaveBeenCalledWith('bob')
        expect(c.body).toEqual({username: 'bob', exceeded: true, reason: 'STORAGE_QUOTA'})
    })

    test('a user under budget answers {exceeded: false, reason: null}', async () => {
        const verdict = jest.fn().mockResolvedValue({username: 'alice', exceeded: false, reason: null})
        const c = ctx({params: {username: 'alice'}})
        await makeApi(makeCommands(), jest.fn(), verdict).check(c)
        expect(c.body).toEqual({username: 'alice', exceeded: false, reason: null})
    })
})
