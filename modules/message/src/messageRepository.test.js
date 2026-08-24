import {jest} from '@jest/globals'

const query = jest.fn()
jest.unstable_mockModule('./db.js', () => ({getPool: () => ({query})}))

const {listMessages, listNotifications, removeMessage, saveMessage, updateNotification} = await import('./messageRepository.js')

beforeEach(() => query.mockReset().mockResolvedValue([[], []]))

test('saveMessage persists the priority', async () => {
    await saveMessage({id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 1})
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO message\.message/i)
    expect(sql).toMatch(/priority/i)
    expect(params).toContain(1)
})

test('saveMessage defaults priority to 0', async () => {
    await saveMessage({id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM'})
    const [, params] = query.mock.calls[0]
    expect(params).toContain(0)
})

test('saveMessage resets the notification state of the message (re-notify)', async () => {
    await saveMessage({id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM', priority: 0})
    const deleteCall = query.mock.calls.find(([sql]) => /DELETE FROM message\.notification/i.test(sql))
    expect(deleteCall).toBeDefined()
    expect(deleteCall[0]).toMatch(/message_id/i)
    expect(deleteCall[1]).toEqual(['m1'])
})

test('listNotifications selects the priority', async () => {
    await listNotifications('bob')
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/m\.priority/i)
})

test('listNotifications orders by update time, so an edited message sorts first', async () => {
    await listNotifications('bob')
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/ORDER BY m\.update_time DESC/i)
})

test('listNotifications selects the per-message acknowledged count (READ rows)', async () => {
    await listNotifications('bob')
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/acknowledged/i)
    expect(sql).toMatch(/COUNT\(\*\)/i)
    expect(sql).toMatch(/state\s*=\s*'READ'/i)
})

test('listNotifications hides unpublished messages unless the user is an admin', async () => {
    await listNotifications('bob', false)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/m\.priority >= 0 OR \?/i)
    expect(params).toEqual(['bob', 'bob', false])
})

test('listNotifications includes unpublished messages for an admin', async () => {
    await listNotifications('admin', true)
    const [, params] = query.mock.calls[0]
    expect(params).toEqual(['admin', 'admin', true])
})

test('listNotifications never reports an unpublished message as unread', async () => {
    await listNotifications('admin', true)
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/CASE WHEN m\.priority < 0 THEN 'READ' ELSE COALESCE\(n\.state, 'UNREAD'\) END/i)
})

test('listMessages orders by update time, so an edited message sorts first', async () => {
    await listMessages()
    const [sql] = query.mock.calls[0]
    expect(sql).toMatch(/ORDER BY update_time DESC/i)
})

test('removeMessage soft-deletes by id', async () => {
    await removeMessage('m1')
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/UPDATE message\.message/i)
    expect(sql).toMatch(/removed\s*=\s*TRUE/i)
    expect(params).toEqual(['m1'])
})

test('updateNotification upserts state', async () => {
    await updateNotification({username: 'bob', messageId: 'm1', state: 'READ'})
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO message\.notification/i)
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/i)
    expect(params).toEqual(['m1', 'bob', 'READ'])
})
