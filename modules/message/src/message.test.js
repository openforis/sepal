import assert from 'node:assert/strict'
import {test} from 'node:test'

import {messageToMap, notificationToMap, rowToMessage, toISOString} from './message.js'

test('toISOString returns standard ISO 8601, null-safe', () => {
    assert.equal(toISOString('2025-05-28T21:38:19.000Z'), '2025-05-28T21:38:19.000Z')
    assert.equal(toISOString(null), null)
})

test('rowToMessage maps snake_case columns', () => {
    const row = {
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z', removed: 0, priority: 1
    }
    assert.partialDeepStrictEqual(rowToMessage(row), {id: 'm1', username: 'admin', type: 'SYSTEM', removed: false, priority: 1})
})

test('messageToMap emits ISO timestamps and message fields', () => {
    const message = rowToMessage({
        id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z', removed: 0, priority: 0
    })
    assert.deepEqual(messageToMap(message), {
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
    assert.deepEqual(notificationToMap(row), {
        message: {
            id: 'm1', username: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
            creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z', priority: 1
        },
        username: 'bob',
        state: 'UNREAD',
        acknowledged: 3
    })
})

test('notificationToMap leaves acknowledged out when it was not counted', () => {
    const row = {
        messageId: 'm1', author: 'admin', subject: 's', contents: 'c', type: 'SYSTEM',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z',
        username: 'bob', state: 'UNREAD', priority: 0, acknowledged: null
    }
    assert.equal('acknowledged' in notificationToMap(row), false)
})
