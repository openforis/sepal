import {messageToMap, notificationToMap, rowToMessage, toISOString} from './message.js'

test('toISOString returns standard ISO 8601, null-safe', () => {
    expect(toISOString('2025-05-28T21:38:19.000Z')).toBe('2025-05-28T21:38:19.000Z')
    expect(toISOString(null)).toBeNull()
})

test('rowToMessage maps snake_case columns', () => {
    const row = {
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z', removed: 0, priority: 1
    }
    expect(rowToMessage(row)).toMatchObject({id: 'm1', username: 'admin', type: 'SYSTEM', removed: false, priority: 1})
})

test('messageToMap emits ISO timestamps and message fields', () => {
    const message = rowToMessage({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z', removed: 0, priority: 0
    })
    expect(messageToMap(message)).toEqual({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', priority: 0
    })
})

test('notificationToMap emits the full Message object under `message`', () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'bob', state: 'UNREAD', priority: 1, acknowledged: 3
    }
    expect(notificationToMap(row)).toEqual({
        message: {
            id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
            creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', priority: 1
        },
        username: 'bob',
        state: 'UNREAD',
        acknowledged: 3
    })
})

test('notificationToMap defaults acknowledged to 0', () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'bob', state: 'UNREAD', priority: 0
    }
    expect(notificationToMap(row).acknowledged).toBe(0)
})
