import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createBudgetApi} from './budgetApi.js'

const makeCommands = () => ({
    loadSpendingReport: mock.fn(),
    updateBudget: mock.fn(async () => undefined),
    requestBudgetUpdate: mock.fn(async () => undefined),
})

const makeApi = (commands, userSpending = mock.fn(), verdict = mock.fn(), openSessionUse = makeOpenSessionUse()) =>
    createBudgetApi({budgetManager: {commands, userSpending, verdict}, openSessionUse})

const makeOpenSessionUse = () => ({openSession: mock.fn(async () => undefined)})

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
        commands.loadSpendingReport.mock.mockImplementation(async () => ({
            alice: reportEntry()
        }))
        const c = ctx()
        await makeApi(commands).report(c)
        assert.deepEqual(c.body, {
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
        commands.loadSpendingReport.mock.mockImplementation(async () => ({
            alice: reportEntry({budgetUpdateRequest: request})
        }))
        const c = ctx()
        await makeApi(commands).report(c)
        assert.deepEqual(c.body.alice.budgetUpdateRequest, request)
    })

    test('budgetUpdateRequest normalised to null (key present, not missing) when absent', async () => {
        const commands = makeCommands()
        commands.loadSpendingReport.mock.mockImplementation(async () => ({
            alice: reportEntry({budgetUpdateRequest: undefined})
        }))
        const c = ctx()
        await makeApi(commands).report(c)
        assert.equal(c.body.alice.budgetUpdateRequest, null)
        // the key must survive JSON.stringify (undefined would be dropped)
        assert.deepEqual(JSON.parse(JSON.stringify(c.body)).alice['budgetUpdateRequest'], null)
    })

    test('empty report → empty map', async () => {
        const commands = makeCommands()
        commands.loadSpendingReport.mock.mockImplementation(async () => ({}))
        const c = ctx()
        await makeApi(commands).report(c)
        assert.deepEqual(c.body, {})
    })
})

describe('POST /budget updateBudget', () => {
    test('calls updateBudget with the right budget and returns the budget triple', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: 'bob', instanceSpending: 3, storageSpending: 4, storageQuota: 5}})
        await makeApi(commands).updateBudget(c)
        assert.deepEqual(callsOf(commands.updateBudget), [[{
            username: 'bob',
            budget: {instanceSpending: 3, storageSpending: 4, storageQuota: 5},
        }]])
        assert.deepEqual(c.body, {instanceSpending: 3, storageSpending: 4, storageQuota: 5})
        assert.equal(c.status, undefined)
    })

    test('blank username → 400, updateBudget not called', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: '   ', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        assert.equal(c.status, 400)
        assert.equal(commands.updateBudget.mock.callCount(), 0)
    })

    test('missing username → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        assert.equal(c.status, 400)
        assert.equal(commands.updateBudget.mock.callCount(), 0)
    })

    test('negative spending → 400, updateBudget not called', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: 'bob', instanceSpending: -1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        assert.equal(c.status, 400)
        assert.equal(commands.updateBudget.mock.callCount(), 0)
    })

    test('non-numeric spending → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {username: 'bob', instanceSpending: 'x', storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).updateBudget(c)
        assert.equal(c.status, 400)
        assert.equal(commands.updateBudget.mock.callCount(), 0)
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
        assert.deepEqual(callsOf(commands.requestBudgetUpdate), [[{
            username: 'carol',
            message: 'more',
            budget: {instanceSpending: 1, storageSpending: 2, storageQuota: 3},
        }]])
        assert.equal(c.status, 204)
    })

    test('blank message → 400, requestBudgetUpdate not called', async () => {
        const commands = makeCommands()
        const c = ctx({body: {message: '  ', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).requestUpdate(c)
        assert.equal(c.status, 400)
        assert.equal(commands.requestBudgetUpdate.mock.callCount(), 0)
    })

    test('missing message → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await makeApi(commands).requestUpdate(c)
        assert.equal(c.status, 400)
        assert.equal(commands.requestBudgetUpdate.mock.callCount(), 0)
    })

    test('negative spending → 400', async () => {
        const commands = makeCommands()
        const c = ctx({body: {message: 'ok', instanceSpending: 1, storageSpending: -5, storageQuota: 1}})
        await makeApi(commands).requestUpdate(c)
        assert.equal(c.status, 400)
        assert.equal(commands.requestBudgetUpdate.mock.callCount(), 0)
    })
})

describe('publishSpending notifications', () => {
    const makePublishingApi = commands => {
        const published = []
        const publishSpending = async username => published.push(username)
        const api = createBudgetApi({budgetManager: {commands, userSpending: mock.fn()}, publishSpending})
        return {api, published}
    }

    test('publishes the user\'s spending after a successful POST /budget', async () => {
        const commands = makeCommands()
        const {api, published} = makePublishingApi(commands)
        const c = ctx({body: {username: 'alice', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await api.updateBudget(c)
        assert.deepEqual(published, ['alice'])
    })

    test('does not publish when POST /budget validation fails', async () => {
        const commands = makeCommands()
        const {api, published} = makePublishingApi(commands)
        const c = ctx({body: {username: '', instanceSpending: 1, storageSpending: 1, storageQuota: 1}})
        await api.updateBudget(c)
        assert.deepEqual(published, [])
    })

    test('publishes the current user\'s spending after a successful POST /budget/requestUpdate', async () => {
        const commands = makeCommands()
        const {api, published} = makePublishingApi(commands)
        const c = ctx({
            body: {message: 'more please', instanceSpending: 1, storageSpending: 1, storageQuota: 1},
            currentUser: {username: 'bob', roles: []},
        })
        await api.requestUpdate(c)
        assert.deepEqual(published, ['bob'])
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
        const userSpending = mock.fn(async () => spendingDto)
        const c = ctx({params: {username: 'bob'}})
        await makeApi(commands, userSpending).spending(c)
        assert.deepEqual(callsOf(userSpending), [['bob']])
        assert.deepEqual(c.body, spendingDto)
    })
})

describe('POST /budget/check/:username', () => {
    test('returns budgetManager.verdict(username) verbatim', async () => {
        const verdict = mock.fn(async () => ({
            username: 'bob',
            exceeded: true,
            reason: 'STORAGE_QUOTA'
        }))
        const c = ctx({params: {username: 'bob'}})
        await makeApi(makeCommands(), mock.fn(), verdict).check(c)
        assert.deepEqual(callsOf(verdict), [['bob']])
        assert.deepEqual(c.body, {username: 'bob', exceeded: true, reason: 'STORAGE_QUOTA'})
    })

    test('a user under budget answers {exceeded: false, reason: null}', async () => {
        const verdict = mock.fn(async () => ({
            username: 'alice',
            exceeded: false,
            reason: null
        }))
        const c = ctx({params: {username: 'alice'}})
        await makeApi(makeCommands(), mock.fn(), verdict).check(c)
        assert.deepEqual(c.body, {username: 'alice', exceeded: false, reason: null})
    })

    test('the worker\'s open sessions count before their WorkerSessionRequested event arrives', async () => {
        const recorded = []
        const openSessionUse = {openSession: mock.fn(async row => {recorded.push(row)})}
        const verdict = mock.fn(async username => recorded.length
            ? {username, exceeded: true, reason: 'INSTANCE_BUDGET'}
            : {username, exceeded: false, reason: null})
        const openSession = {sessionId: 's-1', instanceType: 'T3aSmall', creationTime: '2026-01-01T12:00:00.000Z'}
        const c = ctx({params: {username: 'bob'}, body: {openSessions: [openSession]}})

        await makeApi(makeCommands(), mock.fn(), verdict, openSessionUse).check(c)

        assert.deepEqual(recorded, [{
            sessionId: openSession.sessionId,
            username: 'bob',
            instanceType: openSession.instanceType,
            from: new Date(openSession.creationTime),
        }])
        assert.equal(c.body.exceeded, true)
    })
})
