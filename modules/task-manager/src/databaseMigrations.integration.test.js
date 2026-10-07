import {randomBytes} from 'crypto'
import {mkdtemp, readFile, rm, writeFile} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'

import {createConnection, initDb, migrateDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('importing the worker\'s task history', () => {
    test('copies finished tasks as they are', async () => {
        const task = aWorkerTask({state: 'COMPLETED', status_description: COMPLETED_DESCRIPTION})
        await givenWorkerTasks([task])

        await runImport()

        expect(await importedTasks()).toEqual([{
            id: task.id, state: 'COMPLETED', username: 'alice', operation: 'image.GEE', params: task.params,
            status_description: COMPLETED_DESCRIPTION, recipe_id: task.recipe_id,
            creation_time: task.creation_time, update_time: task.update_time, removed: 0,
            api_key_hash: null, progress_time: null
        }])
    })

    test('fails unfinished tasks as interrupted', async () => {
        await givenWorkerTasks([aWorkerTask({id: 'pending', state: 'PENDING'}), aWorkerTask({id: 'active', state: 'ACTIVE'})])

        await runImport()

        const tasks = await importedTasks()
        expect(tasks.map(({id, state}) => ({id, state}))).toEqual([{id: 'active', state: 'FAILED'}, {id: 'pending', state: 'FAILED'}])
        expect(tasks.map(({status_description}) => JSON.parse(status_description).messageKey))
            .toEqual(['tasks.status.interrupted', 'tasks.status.interrupted'])
    })

    test('completes a cancel that was in progress', async () => {
        await givenWorkerTasks([aWorkerTask({state: 'CANCELING'})])

        await runImport()

        const [task] = await importedTasks()
        expect(task.state).toBe('CANCELED')
        expect(JSON.parse(task.status_description).messageKey).toBe('tasks.status.canceled')
    })

    test('leaves out tasks the user removed', async () => {
        await givenWorkerTasks([aWorkerTask({id: 'kept'}), aWorkerTask({id: 'removed', removed: 1})])

        await runImport()

        expect((await importedTasks()).map(({id}) => id)).toEqual(['kept'])
    })

    test('copies nothing once task-manager has tasks of its own', async () => {
        await givenWorkerTasks([aWorkerTask({id: 'legacy'})])
        await admin.query('INSERT INTO ??.task SET ?', [target, {
            id: 'own', state: 'COMPLETED', username: 'bob', operation: 'image.GEE', params: '{}',
            status_description: COMPLETED_DESCRIPTION, creation_time: new Date(), update_time: new Date()
        }])

        await runImport()

        expect((await importedTasks()).map(({id}) => id)).toEqual(['own'])
    })

    test('does nothing where the worker never had a task table', async () => {
        await admin.query(`DROP TABLE \`${source}\`.task`)

        await runImport()

        expect(await importedTasks()).toEqual([])
    })

    // --- harness ---

    const COMPLETED_DESCRIPTION = '{"defaultMessage":"Completed!","messageKey":"tasks.status.completed","messageArgs":{}}'
    const IMPORT_SQL = join(dirName(import.meta.url), '../migrations/legacy-import/001.do.import.sql')
    const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')

    let admin, source, target, importDir

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    beforeEach(async () => {
        const suffix = randomBytes(6).toString('hex')
        source = `taskimport_worker_${suffix}`
        target = `taskimport_tm_${suffix}`
        await admin.query(`CREATE DATABASE \`${source}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        await admin.query(WORKER_TASK_TABLE(source))
        await initDb(target, SCHEMA_PATH)
        importDir = await mkdtemp(join(tmpdir(), 'task-import-'))
        await writeFile(join(importDir, '001.do.import.sql'), importSqlReading(source, await readFile(IMPORT_SQL, 'utf8')))
    })

    afterEach(async () => {
        await admin.query(`DROP DATABASE IF EXISTS \`${source}\``)
        await admin.query(`DROP DATABASE IF EXISTS \`${target}\``)
        await rm(importDir, {recursive: true, force: true})
    })

    afterAll(() => admin?.end())

    const runImport = () => migrateDb(target, importDir, {schemaTable: 'legacy_import_version'})

    const givenWorkerTasks = async tasks => {
        for (const task of tasks) {
            await admin.query('INSERT INTO ??.task SET ?', [source, task])
        }
    }

    const importedTasks = async () => {
        const [rows] = await admin.query('SELECT * FROM ??.task ORDER BY id', [target])
        return rows.map(row => ({...row}))
    }
})

let sequence = 0

const aWorkerTask = overrides => ({
    id: `task-${++sequence}`,
    state: 'COMPLETED',
    username: 'alice',
    session_id: 'session-1',
    operation: 'image.GEE',
    params: '{"title":"My export"}',
    status_description: '{}',
    creation_time: new Date('2026-09-01T10:00:00.000Z'),
    update_time: new Date('2026-09-01T11:00:00.000Z'),
    removed: 0,
    recipe_id: 'recipe-1',
    ...overrides
})

// The import reads the worker's database by name; the test points it at its own source database and fails if
// the SQL no longer names the worker's database in exactly these two places.
const importSqlReading = (source, sql) => {
    const replaced = sql
        .replace('TABLE_SCHEMA=\'worker\'', `TABLE_SCHEMA='${source}'`)
        .replace('FROM worker.`task`', `FROM ${source}.\`task\``)
    if (replaced.includes('worker.') || replaced.includes('\'worker\'')) {
        throw new Error('The import SQL refers to the worker database in a way this test does not redirect')
    }
    return replaced
}

// modules/worker/migrations/001.do.schema.sql, the task table.
const WORKER_TASK_TABLE = dbName => `
    CREATE TABLE \`${dbName}\`.task (
        id                 varchar(36)  NOT NULL,
        state              varchar(16)  NOT NULL,
        username           varchar(32)  COLLATE ascii_general_ci NOT NULL,
        session_id         varchar(36)  NOT NULL,
        operation          varchar(255) NOT NULL,
        params             longtext     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
        status_description longtext     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
        creation_time      timestamp    NOT NULL,
        update_time        timestamp    NOT NULL,
        removed            tinyint(1)   NOT NULL,
        recipe_id          varchar(36)  DEFAULT NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB`
