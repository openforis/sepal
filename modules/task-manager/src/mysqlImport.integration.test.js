import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql, StaleImportError} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('task-manager import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'task_manager_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'task_manager_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const task = aTask({
            params: {title: 'Café 😀 漢字', image: {recipe: {type: 'MOSAIC', bands: ['red', 'nir']}}},
            statusDescription: 'Ünïcode 😀',
            apiKeyHash: 'a'.repeat(64),
            progressTime: new Date('2026-02-03T04:05:06.789Z'),
            slotTime: new Date('2026-02-03T04:05:07.123Z'),
            removed: 1
        })
        await seedTask(task)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await importedTasks(target), [{...task, removed: true}])
    })

    test('refuses to start after a change to task', async () => {
        const task = aTask()
        await seedTask(task)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE task SET removed = TRUE WHERE id = ?', [task.id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    const seedTask = task =>
        source.query(
            `INSERT INTO task (id, state, username, operation, params, status_description, recipe_id, api_key_hash,
                               creation_time, update_time, progress_time, slot_time, removed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000),
                     FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), ?)`,
            [task.id, task.state, task.username, task.operation, JSON.stringify(task.params), task.statusDescription,
                task.recipeId, task.apiKeyHash, task.creationTime.getTime(), task.updateTime.getTime(),
                task.progressTime?.getTime() ?? null, task.slotTime?.getTime() ?? null, task.removed]
        )
})

const aTask = overrides => ({
    id: 'a-task',
    state: 'ACTIVE',
    username: 'admin',
    operation: 'image.GEE',
    params: {},
    statusDescription: '{}',
    recipeId: 'a-recipe',
    apiKeyHash: null,
    creationTime: new Date('2026-01-02T03:04:05.123Z'),
    updateTime: new Date('2026-01-02T03:04:06.456Z'),
    progressTime: null,
    slotTime: null,
    removed: 0,
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

const importedTasks = async target => {
    const {rows} = await target.query(`
        SELECT id, state, username, operation, params, status_description AS "statusDescription",
               recipe_id AS "recipeId", api_key_hash AS "apiKeyHash", creation_time AS "creationTime",
               update_time AS "updateTime", progress_time AS "progressTime", slot_time AS "slotTime", removed
        FROM task ORDER BY id`)
    return rows
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
