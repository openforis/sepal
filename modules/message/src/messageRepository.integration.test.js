import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {MessageRepository} from './messageRepository.js'

describe('MessageRepository', () => {
    let testDb
    let clock
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'message_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        clock = aClock()
        repository = new MessageRepository(testDb.db, clock)
    })

    afterAll(() => testDb?.remove())

    test('writes to the database it was constructed with', async () => {
        const message = aMessage()

        await repository.saveMessage(message)

        const ids = await savedMessageIds()
        expect(ids).toEqual([message.id])
    })

    test('loads a saved message back', async () => {
        const message = aMessage()

        const saved = await repository.saveMessage(message)

        const loaded = await repository.loadMessage(message.id)
        expect(saved).toMatchObject({id: message.id, subject: message.subject, type: message.type})
        expect(loaded).toEqual(saved)
    })

    test('stores the author in lowercase', async () => {
        const saved = await repository.saveMessage(aMessage({username: 'Admin'}))

        expect(saved.username).toBe('admin')
    })

    test('treats differently cased reader names as the same notification', async () => {
        const message = aMessage()
        await repository.saveMessage(message)
        await repository.updateNotification({username: 'Reader', messageId: message.id, state: 'READ'})

        const [notification] = await repository.listNotifications('READER')
        expect(notification).toMatchObject({state: 'READ', acknowledged: 1})

        await repository.updateNotification({username: 'reader', messageId: message.id, state: 'UNREAD'})

        const [updated] = await repository.listNotifications('Reader')
        expect(updated).toMatchObject({state: 'UNREAD', acknowledged: 0})
    })

    test('keeps the priority a message was saved with, in the message and in its notification', async () => {
        const urgent = aMessage({priority: URGENT})

        const saved = await repository.saveMessage(urgent)

        const [notification] = await repository.listNotifications('reader')
        expect(saved.priority).toBe(URGENT)
        expect(notification).toMatchObject({messageId: urgent.id, priority: URGENT})
    })

    test('gives a message saved without a priority the normal priority', async () => {
        const saved = await repository.saveMessage(aMessage())

        expect(saved.priority).toBe(NORMAL)
    })

    test('makes a message unread again for a reader who had already read it when it is edited', async () => {
        const message = aMessage()
        await repository.saveMessage(message)
        await repository.updateNotification({username: 'reader', messageId: message.id, state: 'READ'})

        await repository.saveMessage({...message, subject: 'Edited subject'})

        const [notification] = await repository.listNotifications('reader')
        expect(notification).toMatchObject({subject: 'Edited subject', state: 'UNREAD', acknowledged: 0})
    })

    test('reports a message read only to the user who read it, and counts it for everyone', async () => {
        const message = aMessage()
        await repository.saveMessage(message)

        await repository.updateNotification({username: 'reader', messageId: message.id, state: 'READ'})

        const [forReader] = await repository.listNotifications('reader')
        const [forAnother] = await repository.listNotifications('another')
        expect(forReader).toMatchObject({messageId: message.id, state: 'READ', acknowledged: 1})
        expect(forAnother).toMatchObject({messageId: message.id, state: 'UNREAD', acknowledged: 1})
    })

    test('replaces an earlier read state, so unreading a message takes it out of the count', async () => {
        const message = aMessage()
        await repository.saveMessage(message)
        await repository.updateNotification({username: 'reader', messageId: message.id, state: 'READ'})

        await repository.updateNotification({username: 'reader', messageId: message.id, state: 'UNREAD'})

        const [notification] = await repository.listNotifications('reader')
        expect(notification).toMatchObject({messageId: message.id, state: 'UNREAD', acknowledged: 0})
    })

    test('hides a removed message from the message list and from notifications', async () => {
        const kept = aMessage({id: 'kept'})
        const removed = aMessage({id: 'removed'})
        await repository.saveMessage(kept)
        await repository.saveMessage(removed)

        await repository.removeMessage(removed.id)

        const messages = await repository.listMessages()
        const notifications = await repository.listNotifications('reader')
        expect(messages.map(({id}) => id)).toEqual([kept.id])
        expect(notifications.map(({messageId}) => messageId)).toEqual([kept.id])
    })

    test('shows an unpublished message to admins only', async () => {
        const published = aMessage({id: 'published'})
        const unpublished = aMessage({id: 'unpublished', priority: UNPUBLISHED})
        await repository.saveMessage(published)
        await repository.saveMessage(unpublished)

        const forReader = await repository.listNotifications('reader', false)
        const forAdmin = await repository.listNotifications('admin', true)

        expect(forReader.map(({messageId}) => messageId)).toEqual([published.id])
        expect(forAdmin.map(({messageId}) => messageId))
            .toEqual(expect.arrayContaining([published.id, unpublished.id]))
    })

    test('never reports an unpublished message as unread, so it notifies nobody', async () => {
        const unpublished = aMessage({priority: UNPUBLISHED})
        await repository.saveMessage(unpublished)

        const [notification] = await repository.listNotifications('admin', true)

        expect(notification).toMatchObject({messageId: unpublished.id, state: 'READ'})
    })

    test('lists messages and notifications with the most recently updated first', async () => {
        const older = aMessage({id: 'announcement'})
        const newer = aMessage({id: 'reminder'})
        clock.set(LAST_YEAR)
        await repository.saveMessage(older)
        clock.set(THIS_YEAR)
        await repository.saveMessage(newer)

        const messages = await repository.listMessages()
        const notifications = await repository.listNotifications('reader')

        expect(messages.map(({id}) => id)).toEqual([newer.id, older.id])
        expect(notifications.map(({messageId}) => messageId)).toEqual([newer.id, older.id])
    })

    // Both lists could be ordered by creation time and still pass the test above, so this one edits the
    // message that was created first and expects it to lead.
    test('moves an edited message ahead of one created after it', async () => {
        const edited = aMessage({id: 'reminder'})
        const untouched = aMessage({id: 'announcement'})
        clock.set(LAST_YEAR)
        await repository.saveMessage(edited)
        clock.set(EARLIER_THIS_YEAR)
        await repository.saveMessage(untouched)
        clock.set(THIS_YEAR)

        await repository.saveMessage({...edited, subject: 'Edited subject'})

        const messages = await repository.listMessages()
        const notifications = await repository.listNotifications('reader')
        expect(messages.map(({id}) => id)).toEqual([edited.id, untouched.id])
        expect(notifications.map(({messageId}) => messageId)).toEqual([edited.id, untouched.id])
    })

    test('rolls back the message edit when resetting read states fails', async () => {
        const message = aMessage()
        await repository.saveMessage(message)
        await repository.updateNotification({username: 'reader', messageId: message.id, state: 'READ'})
        const refusingTheReset = new MessageRepository(failingDb(testDb.db, {
            when: theNotificationReset, error: new Error('notification reset refused')
        }), clock)

        const save = refusingTheReset.saveMessage({...message, subject: 'Edited subject'})

        await expect(save).rejects.toThrow('notification reset refused')
        const loaded = await repository.loadMessage(message.id)
        const [forReader] = await repository.listNotifications('reader')
        expect(loaded).toMatchObject({subject: message.subject})
        expect(forReader).toMatchObject({state: 'READ'})
    })

    const savedMessageIds = async () => {
        const [rows] = await testDb.query('SELECT id FROM message ORDER BY id')
        return rows.map(({id}) => id)
    }
})

const theNotificationReset = sql => /DELETE FROM notification/i.test(sql)

// A fixed default keeps every save's timestamps deterministic; ordering scenarios move it explicitly.
const aClock = (now = A_FIXED_TIME) => {
    const clock = () => now
    clock.set = time => {
        now = time
    }
    return clock
}

const aMessage = overrides => ({
    id: 'a-message',
    username: 'admin',
    subject: 'A subject',
    contents: 'Some contents',
    type: 'SYSTEM',
    ...overrides
})

const A_FIXED_TIME = new Date('2026-03-01T00:00:00Z')
const NORMAL = 0
const URGENT = 1
const UNPUBLISHED = -1
const LAST_YEAR = new Date('2025-06-01T00:00:00Z')
const EARLIER_THIS_YEAR = new Date('2026-01-01T00:00:00Z')
const THIS_YEAR = new Date('2026-06-01T00:00:00Z')

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
