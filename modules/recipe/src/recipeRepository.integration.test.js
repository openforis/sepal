import {readFileSync} from 'fs'
import {join} from 'path'

import {dirName} from '#sepal/path'

import {rowToRecipe} from './recipe.js'

// Mocked SQL cannot prove that the conditional update is atomic under concurrent MySQL writers.

let mysql

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `recipe_test_${process.pid}`

const importMysql = async () => {
    for (const specifier of ['mysql2/promise', 'sepal/node_modules/mysql2/promise.js']) {
        try {
            return (await import(specifier)).default
        } catch (_error) {
            continue
        }
    }
    throw new Error('mysql2 is not resolvable; run this suite where the driver is installed')
}

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

describeIf(Boolean(MYSQL_PASSWORD), 'integration — recipe revisions (requires MYSQL_PASSWORD)', () => {
    let createRecipeRepository
    let adminConn
    let scratchPool

    const repo = () => createRecipeRepository(scratchPool)

    const save = (over = {}) => repo().saveRecipe({
        id: 'r1', username: 'bob', name: 'A recipe', type: 'MOSAIC', projectId: 'p1', typeVersion: 3,
        contents: '{"model":{"a":1}}',
        ...over
    })

    const row = async () => {
        const [rows] = await scratchPool.query(
            `SELECT revision, contents, removed FROM \`${SCRATCH}\`.recipe WHERE id = 'r1'`
        )
        return rows[0]
    }

    // The columns are the only persisted placement and revision; stored contents must never carry either.
    const stored = async () => {
        const {revision, contents} = await row()
        return {revision, contents: JSON.parse(contents)}
    }

    beforeAll(async () => {
        mysql = await importMysql()
        ;({createRecipeRepository} = await import('./recipeRepository.js'))
        adminConn = await mysql.createConnection({
            host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASSWORD, database: 'mysql', multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.recipe (
                id varchar(36) NOT NULL, username varchar(32) NOT NULL, name varchar(255) NOT NULL,
                type varchar(63) NOT NULL, contents longtext NOT NULL,
                creation_time timestamp NOT NULL, update_time timestamp NOT NULL,
                removed boolean NOT NULL DEFAULT FALSE, type_version int DEFAULT 1, project_id varchar(255),
                revision int unsigned NOT NULL DEFAULT 1,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB
        `)
        scratchPool = await mysql.createPool({
            host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASSWORD, database: SCRATCH, connectionLimit: 5
        })
    })

    afterAll(async () => {
        await scratchPool?.end()
        await adminConn?.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
        await adminConn?.end()
    })

    beforeEach(() => scratchPool.query(`DELETE FROM \`${SCRATCH}\`.recipe`))

    test('a create commits at column revision 1, storing contents unchanged', async () => {
        expect(await save()).toEqual({revision: 1})
        expect(await stored()).toEqual({revision: 1, contents: {model: {a: 1}}})
    })

    test('a matching update advances the column exactly once', async () => {
        await save()
        expect(await save({expectedRevision: 1, contents: '{"model":{"a":2}}'})).toEqual({revision: 2})
        expect(await stored()).toEqual({revision: 2, contents: {model: {a: 2}}})
    })

    // A copy inside the contents would go stale at the next move or save.
    test('submitted server metadata is stripped on create, update and model migration', async () => {
        expect(await save({contents: '{"model":{"a":1},"revision":97,"projectId":"p9"}'})).toEqual({revision: 1})
        expect(await stored()).toEqual({revision: 1, contents: {model: {a: 1}}})

        expect(await save({expectedRevision: 1, contents: '{"model":{"a":2},"revision":97,"projectId":"p9"}'}))
            .toEqual({revision: 2})
        expect(await stored()).toEqual({revision: 2, contents: {model: {a: 2}}})

        await repo().saveMigratedRecipe({
            id: 'r1', username: 'bob', typeVersion: 4, contents: '{"model":{"a":3},"revision":97,"projectId":"p9"}'
        })
        expect(await stored()).toEqual({revision: 3, contents: {model: {a: 3}}})
    })

    test('a stale update changes neither the contents nor the column', async () => {
        await save()
        await save({expectedRevision: 1, contents: '{"model":{"a":2}}'})
        const before = await row()

        expect(await save({expectedRevision: 1, contents: '{"model":{"a":3}}'})).toEqual({error: 'CONFLICT', currentRevision: 2})
        expect(await row()).toEqual(before)
    })

    test('two writers from one base revision: exactly one wins', async () => {
        await save()
        const results = await Promise.all([
            save({expectedRevision: 1, contents: '{"model":{"a":2}}'}),
            save({expectedRevision: 1, contents: '{"model":{"a":3}}'})
        ])
        expect(results.map(result => result.error || 'OK').sort()).toEqual(['CONFLICT', 'OK'])
        expect((await row()).revision).toBe(2)
    })

    test('a create against an existing id is a conflict, so a lost acknowledgement is recoverable', async () => {
        await save()
        expect(await save()).toEqual({error: 'CONFLICT', currentRevision: 1})
    })

    test('a foreign recipe is reported missing, and left alone', async () => {
        await save()
        expect(await save({username: 'alice', expectedRevision: 1, contents: '{"model":{"a":9}}'})).toEqual({error: 'NOT_FOUND'})
        expect((await row()).contents).toBe('{"model":{"a":1}}')
    })

    test('an update can never resurrect a removed recipe', async () => {
        await save()
        await repo().removeRecipes(['r1'], 'bob')

        expect(await save({expectedRevision: 1, contents: '{"model":{"a":2}}'})).toEqual({error: 'NOT_FOUND'})
        expect((await row()).removed).toBe(1)
    })

    test('a type change on an existing id is rejected distinctly', async () => {
        await save()
        expect(await save({expectedRevision: 1, type: 'CLASSIFICATION'})).toEqual({error: 'TYPE_MISMATCH', currentRevision: 1})
        expect((await row()).revision).toBe(1)
    })

    // A retry at the unchanged revision must not write stale project placement back.
    test('a save leaves the project alone, so a retry after a move cannot undo it', async () => {
        await save()
        await repo().moveRecipes('p2', ['r1'], 'bob')

        expect(await save({expectedRevision: 1, contents: '{"model":{"a":2}}'})).toEqual({revision: 2})

        const [rows] = await scratchPool.query(`SELECT project_id FROM \`${SCRATCH}\`.recipe WHERE id = 'r1'`)
        expect(rows[0].project_id).toBe('p2')
    })

    test('a model migration advances the column once; a project move advances it not at all', async () => {
        await save()
        await repo().saveMigratedRecipe({
            id: 'r1', username: 'bob', typeVersion: 4, contents: '{"model":{"a":9},"revision":97}'
        })
        expect(await stored()).toEqual({revision: 2, contents: {model: {a: 9}}})

        await repo().moveRecipes('p2', ['r1'], 'bob')
        expect((await row()).revision).toBe(2)
    })

    test('a migration that matches no row fails instead of reporting success', async () => {
        await expect(repo().saveMigratedRecipe({
            id: 'r1', username: 'bob', typeVersion: 4, contents: '{"model":{"a":9}}'
        })).rejects.toThrow(/r1/)
    })

    describe('the revision migration', () => {
        const LEGACY = `${SCRATCH}_legacy`

        const migrate = () => adminConn.query(readFileSync(
            join(dirName(import.meta.url), '../migrations/002.do.revision.sql'), 'utf8'
        ).replaceAll('recipe.recipe', `\`${LEGACY}\`.recipe`))

        beforeEach(async () => {
            await adminConn.query(`DROP SCHEMA IF EXISTS \`${LEGACY}\``)
            await adminConn.query(`CREATE SCHEMA \`${LEGACY}\``)
            await adminConn.query(`
                CREATE TABLE \`${LEGACY}\`.recipe (
                    id varchar(36) NOT NULL, username varchar(32) NOT NULL, name varchar(255) NOT NULL,
                    type varchar(63) NOT NULL, contents longtext NOT NULL,
                    creation_time timestamp NOT NULL, update_time timestamp NOT NULL,
                    removed boolean NOT NULL DEFAULT FALSE, type_version int DEFAULT 1,
                    project_id varchar(255), PRIMARY KEY (id)
                ) ENGINE=InnoDB
            `)
        })

        afterEach(() => adminConn.query(`DROP SCHEMA IF EXISTS \`${LEGACY}\``))

        const insert = (id, contents) => adminConn.query(
            `INSERT INTO \`${LEGACY}\`.recipe (id, username, name, type, contents, creation_time, update_time)
             VALUES (?, 'bob', 'n', 'MOSAIC', ?, NOW(), NOW())`,
            [id, contents]
        )

        test('backfills every existing row to column revision 1, rewriting no contents', async () => {
            await insert('a', '{"model":{"x":1}}')
            await insert('b', '{"model":{"y":2}}')

            await migrate()

            const [rows] = await adminConn.query(`SELECT id, revision, contents FROM \`${LEGACY}\`.recipe ORDER BY id`)
            expect(rows).toEqual([
                {id: 'a', revision: 1, contents: '{"model":{"x":1}}'},
                {id: 'b', revision: 1, contents: '{"model":{"y":2}}'}
            ])
        })
    })

    // Legacy rows predate the stripping adapter, so stored placement and revision must lose to the columns.
    test('a load injects the columns, whatever a legacy document held', async () => {
        await save()
        await scratchPool.query(
            `UPDATE \`${SCRATCH}\`.recipe
             SET contents = '{"model":{"a":1},"revision":97,"projectId":"p9"}' WHERE id = 'r1'`
        )

        expect(rowToRecipe(await repo().getById('r1'))).toEqual({model: {a: 1}, projectId: 'p1', revision: 1})
    })

    // A move rewrites the column alone, so the load that follows it must not resurrect the old placement.
    test('a load after a move injects the new project, and the move advances no revision', async () => {
        await save()
        await repo().moveRecipes('p2', ['r1'], 'bob')

        expect(rowToRecipe(await repo().getById('r1'))).toEqual({model: {a: 1}, projectId: 'p2', revision: 1})
    })
})
