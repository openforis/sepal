import {join} from 'path'

import {createConnection} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

describe('createTestDb', () => {
    let provisioner
    let own
    let other

    beforeAll(async () => {
        configureNoLogging()
        provisioner = await createConnection('mysql')
        own = await createTestDb({name: 'owndatabase', migrations: SEEDED})
        other = await createTestDb({name: 'otherdatabase', migrations: SEEDED})
    })

    beforeEach(() => own.reset())

    afterEach(() => removeAll([...temporary.splice(0), ...lookAlikes.splice(0)]))

    afterAll(() => removeAll([own, other, provisioner]))

    describe('the account it grants', () => {
        test('reads and writes its own database', async () => {
            await own.query('INSERT INTO recorded_event SET ?', {id: 'an-event', note: 'written'})

            const [rows] = await own.query('SELECT note FROM recorded_event')

            expect(rows.map(({note}) => note)).toEqual(['written'])
        })

        test('cannot read or delete another test-owned database, which is left unchanged', async () => {
            const read = own.query(`SELECT name FROM \`${other.dbName}\`.reference_item`)
            await expect(read).rejects.toThrow(/denied/i)

            const remove = own.query(`DELETE FROM \`${other.dbName}\`.reference_item`)
            await expect(remove).rejects.toThrow(/denied/i)

            const [survivors] = await other.query('SELECT name FROM reference_item ORDER BY id')
            expect(survivors.map(({name}) => name)).toEqual(['first', 'second'])
        })

        test('reaches its own database, and no other, on an independent connection', async () => {
            const read = await own.withAnotherConnection(async connection => {
                const [rows] = await connection.query('SELECT name FROM reference_item ORDER BY id')
                return rows.map(({name}) => name)
            })

            expect(read).toEqual(['first', 'second'])
            const reachOther = own.withAnotherConnection(connection =>
                connection.query(`SELECT name FROM \`${other.dbName}\`.reference_item`)
            )
            await expect(reachOther).rejects.toThrow(/denied/i)
        })

        // `_` is a wildcard in the database part of a grant, so an unescaped grant would reach this one.
        test('cannot reach a database whose name merely looks like its own', async () => {
            const lookAlike = await givenALookAlikeDatabaseOf(own.dbName)

            const read = own.query(`SELECT id FROM \`${lookAlike.dbName}\`.item`)

            await expect(read).rejects.toThrow(/denied/i)
            const [survivors] = await provisioner.query('SELECT id FROM ??.item', [lookAlike.dbName])
            expect(survivors).toHaveLength(1)
        })
    })

    describe('the baseline it restores', () => {
        test('brings back rows deleted or changed, and drops rows added since', async () => {
            await own.query('DELETE FROM reference_item WHERE id = 10')
            await own.query('UPDATE reference_item SET name = ? WHERE id = 20', ['changed'])
            await own.query('INSERT INTO reference_item SET ?', {id: 30, name: 'added'})

            await own.reset()

            const [rows] = await own.query('SELECT id, name FROM reference_item ORDER BY id')
            expect(rows).toEqual([{id: 10, name: 'first'}, {id: 20, name: 'second'}])
        })

        // The baseline counter is ahead of the largest surviving id, so re-inserting the rows alone
        // would leave it at 21.
        test('brings back the position the identity counter had reached', async () => {
            await own.query('INSERT INTO reference_item SET ?', {name: 'consumes an id'})

            await own.reset()

            const [inserted] = await own.query('INSERT INTO reference_item SET ?', {name: 'after the reset'})
            expect(inserted.insertId).toBe(31)
        })

        // Construction gets as far as granting the account before this fails, so it also shows whether a
        // failure after that point leaves the grant behind.
        test('refuses a schema it cannot restore row by row, keeping no database or grant', async () => {
            const withAForeignKey = createTestDb({name: 'unsupportedschema', migrations: UNSUPPORTED})

            await expect(withAForeignKey).rejects.toThrow(/foreignKeys/)
            const databases = await databaseCount('unsupportedschema')
            const grants = await accountsGrantedOn('unsupportedschema')
            expect(databases).toBe(0)
            expect(grants).toEqual([])
        })

        test('refuses every route into the database once a reset has failed', async () => {
            const fragile = await givenATestDb({name: 'failedreset', migrations: SEEDED})
            await provisioner.query('DROP TABLE ??.reference_item', [fragile.dbName])

            const failed = fragile.reset()

            await expect(failed).rejects.toThrow()
            await expect(fragile.reset()).rejects.toThrow()
            await expect(fragile.query('SELECT 1')).rejects.toThrow()
            await expect(fragile.db.withTransaction(async () => 'unused')).rejects.toThrow()
            await expect(fragile.db.withConnection(async () => 'unused')).rejects.toThrow()
            await expect(fragile.withAnotherConnection(async () => 'unused')).rejects.toThrow()
        })
    })

    describe('the resources it owns', () => {
        test('removes the database and the account it created', async () => {
            const temporaryDb = await givenATestDb({name: 'removable', migrations: SEEDED})
            const [account] = await accountsGrantedOnExactly(temporaryDb.dbName)

            await temporaryDb.remove()

            const database = await databaseCount('removable')
            const survives = await accountExists(account)
            expect(account).toMatch(/^t_/)
            expect(database).toBe(0)
            expect(survives).toBe(false)
        })

        test('leaves nothing behind when construction fails', async () => {
            const failed = createTestDb({name: 'brokenmigration', migrations: BROKEN})

            await expect(failed).rejects.toThrow()
            const databases = await databaseCount('brokenmigration')
            const grants = await accountsGrantedOn('brokenmigration')
            expect(databases).toBe(0)
            expect(grants).toEqual([])
        })
    })

    // Removed even when an assertion fails, so a test cannot leave a database or an account behind.
    const givenATestDb = async options => {
        const created = await createTestDb(options)
        temporary.push(created)
        return created
    }

    const givenALookAlikeDatabaseOf = async dbName => {
        const lookAlikeName = dbName.replaceAll('_', 'x')
        await provisioner.query(`CREATE DATABASE \`${lookAlikeName}\``)
        const lookAlike = {
            dbName: lookAlikeName,
            remove: () => provisioner.query(`DROP DATABASE IF EXISTS \`${lookAlikeName}\``)
        }
        lookAlikes.push(lookAlike)
        await provisioner.query('CREATE TABLE ??.item (id INT PRIMARY KEY)', [lookAlikeName])
        await provisioner.query('INSERT INTO ??.item SET ?', [lookAlikeName, {id: 1}])
        return lookAlike
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

    // A grant records the database it was made on with `_` escaped, so an exact comparison has to use
    // that same form. Naming one database keeps the answer independent of anything another run left.
    const accountsGrantedOnExactly = async dbName => {
        const [rows] = await provisioner.query(
            'SELECT User FROM mysql.db WHERE Db = ? ORDER BY User', [dbName.replaceAll('_', '\\_')]
        )
        return rows.map(({User}) => User)
    }

    // Where construction failed the database name is unknown, so this looks for any grant under the
    // test's prefix. The prefix stops before the first underscore, which the escaping would otherwise
    // put a backslash in front of.
    const accountsGrantedOn = async prefix => {
        const [rows] = await provisioner.query(
            'SELECT User FROM mysql.db WHERE Db LIKE ? ORDER BY User', [`${prefix}%`]
        )
        return rows.map(({User}) => User)
    }

    const accountExists = async username => {
        const [rows] = await provisioner.query('SELECT 1 FROM mysql.user WHERE user = ?', [username])
        return rows.length > 0
    }

    const databaseCount = async prefix => {
        const [rows] = await provisioner.query(
            'SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE ?', [`${prefix}%`]
        )
        return rows[0].count
    }

    const temporary = []
    const lookAlikes = []
})

const FIXTURES = join(dirName(import.meta.url), 'fixtures')
const SEEDED = join(FIXTURES, 'seeded')
const BROKEN = join(FIXTURES, 'broken')
const UNSUPPORTED = join(FIXTURES, 'unsupported')
