import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql, StaleImportError} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('message import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'message_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'message_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const message = aMessage({subject: 'Café 😀 漢字', contents: 'Ünïcode 😀', removed: 1, priority: -1})
        const notification = aNotification(message.id)
        await seedMessage(message)
        await seedNotification(notification)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await importedMessages(target), [{...message, removed: true}])
        assert.deepEqual(await importedNotifications(target), [notification])
    })

    test('refuses to start after a change to message', async () => {
        const message = aMessage()
        await seedMessage(message)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE message SET removed = TRUE WHERE id = ?', [message.id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to notification', async () => {
        const message = aMessage()
        await seedMessage(message)
        await seedNotification(aNotification(message.id, {state: 'UNREAD'}))
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE notification SET state = ? WHERE message_id = ?', ['READ', message.id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    const seedMessage = ({id, username, subject, contents, type, creationTime, updateTime, removed, priority}) =>
        source.query(
            `INSERT INTO message (id, username, subject, contents, type, creation_time, update_time, removed, priority)
             VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), ?, ?)`,
            [id, username, subject, contents, type, creationTime.getTime(), updateTime.getTime(), removed, priority]
        )

    const seedNotification = ({messageId, username, state}) =>
        source.query('INSERT INTO notification (message_id, username, state) VALUES (?, ?, ?)', [messageId, username, state])
})

const aMessage = overrides => ({
    id: 'a-message',
    username: 'admin',
    subject: 'A subject',
    contents: 'Some contents',
    type: 'SYSTEM',
    creationTime: new Date('2026-01-02T03:04:05Z'),
    updateTime: new Date('2026-02-03T04:05:06Z'),
    removed: 0,
    priority: 0,
    ...overrides
})

const aNotification = (messageId, overrides) => ({
    messageId,
    username: 'reader',
    state: 'READ',
    ...overrides
})

const importOf = (source, target) => ({
    dbName: target.dbName,
    sourceDb: source.dbName,
    sqlPath: IMPORT_SQL,
    fingerprint: FINGERPRINT,
    mysql: {
        host: process.env.MYSQL_FDW_HOST ?? process.env.MYSQL_HOST,
        user: source.account.username,
        password: source.account.password
    }
})

const importedMessages = async target => {
    const {rows} = await target.query(`
        SELECT id, username, subject, contents, type, creation_time AS "creationTime",
               update_time AS "updateTime", removed, priority
        FROM message ORDER BY id`)
    return rows
}

const importedNotifications = async target => {
    const {rows} = await target.query('SELECT message_id AS "messageId", username, state FROM notification ORDER BY message_id, username')
    return rows
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
