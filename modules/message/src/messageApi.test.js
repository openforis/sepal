import {jest} from '@jest/globals'

const repo = {
    saveMessage: jest.fn(),
    removeMessage: jest.fn(),
    listNotifications: jest.fn(),
    updateNotification: jest.fn()
}
jest.unstable_mockModule('./messageRepository.js', () => repo)

const api = await import('./messageApi.js')
const {messageChanged$} = await import('./changed.js')

const ctx = (overrides = {}) => ({
    params: {}, query: {}, request: {body: {}},
    state: {currentUser: {username: 'admin'}},
    ...overrides
})

const changes = []
messageChanged$.subscribe(change => changes.push(change))

beforeEach(() => {
    Object.values(repo).forEach(fn => fn.mockReset())
    changes.length = 0
})

test('saveMessage returns 200 with mapped message', async () => {
    repo.saveMessage.mockResolvedValue({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    })
    const c = ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}})
    await api.saveMessage(c)
    expect(repo.saveMessage).toHaveBeenCalledWith(
        {id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0}
    )
    expect(c.status).toBe(200)
    expect(c.body).toMatchObject({id: 'm1', type: 'SYSTEM', creationTime: '2025-05-28T21:38:19.000Z'})
})

test('saveMessage marks the message read for its author', async () => {
    repo.saveMessage.mockResolvedValue({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    })
    await api.saveMessage(ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}}))
    expect(repo.updateNotification).toHaveBeenCalledWith({username: 'admin', messageId: 'm1', state: 'READ'})
})

test('saveMessage passes the priority through', async () => {
    repo.saveMessage.mockResolvedValue({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 1,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    })
    const c = ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM', priority: 1}}})
    await api.saveMessage(c)
    expect(repo.saveMessage).toHaveBeenCalledWith(
        {id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 1}
    )
    expect(c.body).toMatchObject({id: 'm1', priority: 1})
})

test('saveMessage defaults priority to 0', async () => {
    repo.saveMessage.mockResolvedValue({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    })
    await api.saveMessage(ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}}))
    expect(repo.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({priority: 0})
    )
})

test('saveMessage publishes a message-scoped change', async () => {
    repo.saveMessage.mockResolvedValue({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', removed: false
    })
    await api.saveMessage(ctx({params: {id: 'm1'}, request: {body: {subject: 's', contents: 'c', type: 'SYSTEM'}}}))
    expect(changes).toEqual([{}])
})

test('removeMessage returns 204', async () => {
    const c = ctx({params: {id: 'm1'}})
    await api.removeMessage(c)
    expect(repo.removeMessage).toHaveBeenCalledWith('m1')
    expect(c.status).toBe(204)
})

test('removeMessage publishes a message-scoped change', async () => {
    await api.removeMessage(ctx({params: {id: 'm1'}}))
    expect(changes).toEqual([{}])
})

test('listNotifications returns mapped notifications for current user', async () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'admin', state: 'UNREAD'
    }
    repo.listNotifications.mockResolvedValue([row])
    const c = ctx()
    await api.listNotifications(c)
    expect(repo.listNotifications).toHaveBeenCalledWith('admin', false)
    expect(c.body[0].message.id).toBe('m1')
    expect(c.body[0].message.subject).toBe('s')
    expect(c.body[0].state).toBe('UNREAD')
})

test('listNotifications includes unpublished messages for an admin user', async () => {
    repo.listNotifications.mockResolvedValue([])
    const c = ctx({state: {currentUser: {username: 'admin', roles: ['application_admin']}}})
    await api.listNotifications(c)
    expect(repo.listNotifications).toHaveBeenCalledWith('admin', true)
})

test('userNotifications passes the admin flag through', async () => {
    repo.listNotifications.mockResolvedValue([])
    await api.userNotifications('admin', true)
    expect(repo.listNotifications).toHaveBeenCalledWith('admin', true)
})

test('updateNotification returns 204', async () => {
    const c = ctx({params: {id: 'm1'}, request: {body: {state: 'READ'}}})
    await api.updateNotification(c)
    expect(repo.updateNotification).toHaveBeenCalledWith({username: 'admin', messageId: 'm1', state: 'READ'})
    expect(c.status).toBe(204)
})

test('updateNotification publishes a message-scoped change, so acknowledged counts refresh for everyone', async () => {
    await api.updateNotification(ctx({params: {id: 'm1'}, request: {body: {state: 'READ'}}}))
    expect(changes).toEqual([{}])
})

test('listNotifications publishes no change', async () => {
    repo.listNotifications.mockResolvedValue([])
    await api.listNotifications(ctx())
    expect(changes).toEqual([])
})

test('userNotifications returns mapped notifications', async () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'alice', state: 'READ'
    }
    repo.listNotifications.mockResolvedValue([row])
    const notifications = await api.userNotifications('alice')
    expect(repo.listNotifications).toHaveBeenCalledWith('alice', false)
    expect(notifications).toEqual([expect.objectContaining({
        message: expect.objectContaining({id: 'm1', username: 'admin'}),
        username: 'alice',
        state: 'READ'
    })])
})
