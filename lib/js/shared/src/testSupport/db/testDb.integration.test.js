import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {createConnection} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

describe('createTestDb', () => {
    let provisioner
    let own
    let other

    before(async () => {
        configureNoLogging()
        provisioner = await createConnection('postgres', SUPERUSER)
        own = await createTestDb({name: 'owndatabase', migrations: SEEDED})
        other = await createTestDb({name: 'otherdatabase', migrations: SEEDED})
    })

    beforeEach(() => own.reset())

    afterEach(() => removeAll(temporary.splice(0)))

    after(() => removeAll([own, other, provisioner]))

    describe('the account it grants', () => {
        test('reads and writes its own database', async () => {
            await own.query('INSERT INTO recorded_event (id, note) VALUES ($1, $2)', ['an-event', 'written'])

            const {rows} = await own.query('SELECT note FROM recorded_event')

            assert.deepEqual(rows.map(({note}) => note), ['written'])
        })

        test('cannot read or delete another test-owned database, which is left unchanged', async () => {
            const remove = asAccount(own.account, other.dbName, connection =>
                connection.query('DELETE FROM reference_item')
            )

            await assert.rejects(remove, /permission denied for database/)
            const {rows: survivors} = await other.query('SELECT name FROM reference_item ORDER BY id')
            assert.deepEqual(survivors.map(({name}) => name), ['first', 'second'])
        })

        test('reaches its own database, and no other, on an independent connection', async () => {
            const read = await own.withAnotherConnection(async connection => {
                const {rows: [{user}]} = await connection.query('SELECT current_user AS user')
                const {rows} = await connection.query('SELECT name FROM reference_item ORDER BY id')
                return {user, names: rows.map(({name}) => name)}
            })

            assert.deepEqual(read, {user: own.account.username, names: ['first', 'second']})
        })
    })

    describe('the connections it allows', () => {
        test('fails an acquisition beyond its connections instead of waiting for one', {timeout: 5000}, async () => {
            const nested = own.db.withTransaction(() => own.query('SELECT 1'))

            await assert.rejects(nested, /connection/)
            const {rows} = await own.query('SELECT 1 AS reusable')
            assert.deepEqual(rows, [{reusable: 1}])
        })
    })

    describe('the baseline it restores', () => {
        test('brings back rows deleted or changed, and drops rows added since', async () => {
            await own.query('DELETE FROM reference_item WHERE id = 10')
            await own.query('UPDATE reference_item SET name = $1 WHERE id = 20', ['changed'])
            await own.query('INSERT INTO reference_item (name) VALUES ($1)', ['added'])

            await own.reset()

            const {rows} = await own.query('SELECT id, name FROM reference_item ORDER BY id')
            assert.deepEqual(rows, [{id: 10, name: 'first'}, {id: 20, name: 'second'}])
        })

        // The baseline counter is ahead of the largest surviving id, so re-inserting the rows alone
        // would not reproduce it, and restarting it would hand out 1.
        test('brings back the position the identity counter had reached', async () => {
            await own.query('INSERT INTO reference_item (name) VALUES ($1)', ['consumes an id'])

            await own.reset()

            const {rows: [inserted]} = await own.query(
                'INSERT INTO reference_item (name) VALUES ($1) RETURNING id', ['after the reset']
            )
            assert.equal(inserted.id, 31)
        })

        // A counter never drawn from before the baseline hands out its first value again.
        test('restores identity counters with the baseline', async () => {
            const {rows: [before]} = await own.query(
                'INSERT INTO numbered_note (note) VALUES ($1) RETURNING id', ['before the reset']
            )

            await own.reset()

            const {rows: [after]} = await own.query(
                'INSERT INTO numbered_note (note) VALUES ($1) RETURNING id', ['after the reset']
            )
            assert.equal(after.id, before.id)
        })

        // Construction gets as far as creating the account before this fails, so it also shows whether a
        // failure after that point leaves the account behind.
        test('refuses a schema it cannot restore row by row, keeping no database or grant', async () => {
            const withAForeignKey = createTestDb({name: 'unsupportedschema', migrations: UNSUPPORTED})

            await assert.rejects(withAForeignKey, /foreignKeys/)
            const databases = await databaseCount('unsupportedschema')
            const accounts = await accountsFor('unsupportedschema')
            assert.equal(databases, 0)
            assert.deepEqual(accounts, [])
        })

        test('refuses every route into the database once a reset has failed', async () => {
            const fragile = await givenATestDb({name: 'failedreset', migrations: SEEDED})
            await asSuperuser(fragile.dbName, connection => connection.query('DROP TABLE reference_item'))

            const failed = fragile.reset()

            await assert.rejects(failed)
            await assert.rejects(fragile.reset())
            await assert.rejects(fragile.query('SELECT 1'))
            await assert.rejects(fragile.db.withTransaction(async () => 'unused'))
            await assert.rejects(fragile.db.withConnection(async () => 'unused'))
            await assert.rejects(fragile.withAnotherConnection(async () => 'unused'))
        })
    })

    describe('the resources it owns', () => {
        test('removes the database and the account it created', async () => {
            const temporaryDb = await givenATestDb({name: 'removable', migrations: SEEDED})

            await temporaryDb.remove()

            const database = await databaseCount('removable')
            const survives = await accountExists(temporaryDb.account.username)
            assert.equal(database, 0)
            assert.equal(survives, false)
        })

        test('leaves nothing behind when construction fails', async () => {
            const failed = createTestDb({name: 'brokenmigration', migrations: BROKEN})

            await assert.rejects(failed)
            const databases = await databaseCount('brokenmigration')
            const accounts = await accountsFor('brokenmigration')
            assert.equal(databases, 0)
            assert.deepEqual(accounts, [])
        })
    })

    // Removed even when an assertion fails, so a test cannot leave a database or an account behind.
    const givenATestDb = async options => {
        const created = await createTestDb(options)
        temporary.push(created)
        return created
    }

    const asAccount = (account, dbName, callback) =>
        withConnection(dbName, {user: account.username, password: account.password}, callback)

    const asSuperuser = (dbName, callback) =>
        withConnection(dbName, SUPERUSER, callback)

    const withConnection = async (dbName, credentials, callback) => {
        const connection = await createConnection(dbName, credentials)
        try {
            return await callback(connection)
        } finally {
            await connection.end()
        }
    }

    // Every resource is attempted, and a failure to clean up fails the test rather than passing quietly.
    const removeAll = async resources => {
        const failures = []
        for (const resource of resources) {
            try {
                await (resource?.remove ?? resource?.end)?.call(resource)
            } catch (error) {
                failures.push(error)
            }
        }
        if (failures.length) {
            throw failures[0]
        }
    }

    // Where construction failed the database name is unknown, so this looks for any account under the
    // test's prefix.
    const accountsFor = async prefix => {
        const {rows} = await provisioner.query(
            'SELECT rolname FROM pg_roles WHERE starts_with(rolname, $1) ORDER BY rolname', [`t_${prefix}`]
        )
        return rows.map(({rolname}) => rolname)
    }

    const accountExists = async username => {
        const {rowCount} = await provisioner.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [username])
        return rowCount > 0
    }

    const databaseCount = async prefix => {
        const {rows: [{count}]} = await provisioner.query(
            'SELECT count(*) AS count FROM pg_database WHERE starts_with(datname, $1)', [prefix]
        )
        return count
    }

    const temporary = []
})

const SUPERUSER = {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD}
const FIXTURES = join(dirName(import.meta.url), 'fixtures', 'postgres')
const SEEDED = join(FIXTURES, 'seeded')
const BROKEN = join(FIXTURES, 'broken')
const UNSUPPORTED = join(FIXTURES, 'unsupported')
