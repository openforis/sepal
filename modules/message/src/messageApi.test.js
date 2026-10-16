import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {messageChanged$} from './changed.js'
import {MessageApi} from './messageApi.js'

let repo
let api

const ctx = (overrides = {}) => ({
    params: {}, query: {}, request: {body: {}},
    state: {currentUser: {username: 'admin'}},
    ...overrides
})

const changes = []
messageChanged$.subscribe(change => changes.push(change))

beforeEach(() => {
    repo = {
        saveMessage: mock.fn(),
        removeMessage: mock.fn(),
        listNotifications: mock.fn(),
        updateNotification: mock.fn()
    }
    api = new MessageApi(repo)
    changes.length = 0
})

test('saveMessage returns 200 with mapped message', async () => {
    repo.saveMessage.mock.mockImplementation(async () => ({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    }))
    const c = ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}})
    await api.saveMessage(c)
    assert.deepEqual(callsOf(repo.saveMessage), [
        [{id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0}]
    ])
    assert.equal(c.status, 200)
    assert.partialDeepStrictEqual(c.body, {id: 'm1', type: 'SYSTEM', creationTime: '2025-05-28T21:38:19.000Z'})
})

test('saveMessage marks the message read for its author', async () => {
    repo.saveMessage.mock.mockImplementation(async () => ({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    }))
    await api.saveMessage(ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}}))
    assert.deepEqual(callsOf(repo.updateNotification), [[{username: 'admin', messageId: 'm1', state: 'READ'}]])
})

test('saveMessage passes the priority through', async () => {
    repo.saveMessage.mock.mockImplementation(async () => ({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 1,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    }))
    const c = ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM', priority: 1}}})
    await api.saveMessage(c)
    assert.deepEqual(callsOf(repo.saveMessage), [
        [{id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 1}]
    ])
    assert.partialDeepStrictEqual(c.body, {id: 'm1', priority: 1})
})

test('saveMessage defaults priority to 0', async () => {
    repo.saveMessage.mock.mockImplementation(async () => ({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    }))
    await api.saveMessage(ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}}))
    assert.partialDeepStrictEqual(callsOf(repo.saveMessage), [[{priority: 0}]])
})

test('saveMessage publishes a message-scoped change', async () => {
    repo.saveMessage.mock.mockImplementation(async () => ({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    }))
    await api.saveMessage(ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}}))
    assert.deepEqual(changes, [{}])
})

test('removeMessage returns 204', async () => {
    const c = ctx({params: {id: 'm1'}})
    await api.removeMessage(c)
    assert.deepEqual(callsOf(repo.removeMessage), [['m1']])
    assert.equal(c.status, 204)
})

test('removeMessage publishes a message-scoped change', async () => {
    await api.removeMessage(ctx({params: {id: 'm1'}}))
    assert.deepEqual(changes, [{}])
})

test('listNotifications returns mapped notifications for current user', async () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'admin', state: 'UNREAD'
    }
    repo.listNotifications.mock.mockImplementation(async () => [row])
    const c = ctx()
    await api.listNotifications(c)
    assert.deepEqual(callsOf(repo.listNotifications), [['admin', false]])
    assert.equal(c.body[0].message.id, 'm1')
    assert.equal(c.body[0].message.subject, 's')
    assert.equal(c.body[0].state, 'UNREAD')
})

test('listNotifications includes unpublished messages for an admin user', async () => {
    repo.listNotifications.mock.mockImplementation(async () => [])
    const c = ctx({state: {currentUser: {username: 'admin', roles: ['application_admin']}}})
    await api.listNotifications(c)
    assert.deepEqual(callsOf(repo.listNotifications), [['admin', true]])
})

test('userNotifications passes the admin flag through', async () => {
    repo.listNotifications.mock.mockImplementation(async () => [])
    await api.userNotifications('admin', true)
    assert.deepEqual(callsOf(repo.listNotifications), [['admin', true]])
})

test('updateNotification returns 204', async () => {
    const c = ctx({params: {id: 'm1'}, request: {body: {state: 'READ'}}})
    await api.updateNotification(c)
    assert.deepEqual(callsOf(repo.updateNotification), [[{username: 'admin', messageId: 'm1', state: 'READ'}]])
    assert.equal(c.status, 204)
})

test('updateNotification publishes a message-scoped change, so acknowledged counts refresh for everyone', async () => {
    await api.updateNotification(ctx({params: {id: 'm1'}, request: {body: {state: 'READ'}}}))
    assert.deepEqual(changes, [{}])
})

test('listNotifications publishes no change', async () => {
    repo.listNotifications.mock.mockImplementation(async () => [])
    await api.listNotifications(ctx())
    assert.deepEqual(changes, [])
})

test('userNotifications returns mapped notifications', async () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'alice', state: 'READ'
    }
    repo.listNotifications.mock.mockImplementation(async () => [row])
    const notifications = await api.userNotifications('alice')
    assert.deepEqual(callsOf(repo.listNotifications), [['alice', false]])
    assert.equal(notifications.length, 1)
    assert.partialDeepStrictEqual(notifications[0], {
        message: {id: 'm1', username: 'admin'},
        username: 'alice',
        state: 'READ'
    })
})

const callsOf = fn => fn.mock.calls.map(({arguments: args}) => args)
