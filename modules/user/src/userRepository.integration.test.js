import {jest} from '@jest/globals'
import {randomBytes} from 'crypto'
import {join} from 'path'

import {createConnection, createPool, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')

// The repository reaches its pool through db.js; here that pool is a scratch database built from the
// real migrations, so the statements run against the schema they will meet in production.
const scratch = {}
jest.unstable_mockModule('./db.js', () => ({
    getPool: () => scratch.pool
}))

const repository = await import('./userRepository.js')

describe('updateUserDetails with optimistic locking', () => {
    let admin

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
        scratch.dbName = `userrepository_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${scratch.dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        await initDb(scratch.dbName, SCHEMA_PATH)
        scratch.pool = await createPool(scratch.dbName)
    })

    afterAll(async () => {
        await scratch.pool?.end()
        await admin.query(`DROP DATABASE IF EXISTS \`${scratch.dbName}\``)
        await admin.end()
    })

    test('a new user starts at revision 1', async () => {
        const username = await insertUser()

        const user = await repository.findByUsername(username)

        expect(user.revision).toBe(1)
    })

    test('writes the details and bumps the revision when the caller holds the current one', async () => {
        const username = await insertUser()

        const updated = await repository.updateUserDetails({...details(username), name: 'Robert', revision: 1})

        const user = await repository.findByUsername(username)
        expect(updated).toBe(true)
        expect(user).toMatchObject({name: 'Robert', revision: 2})
    })

    test('writes nothing when the caller holds a stale revision', async () => {
        const username = await insertUser()
        await repository.updateUserDetails({...details(username), name: 'Robert', revision: 1})

        const updated = await repository.updateUserDetails({...details(username), name: 'Bobby', revision: 1})

        const user = await repository.findByUsername(username)
        expect(updated).toBe(false)
        expect(user).toMatchObject({name: 'Robert', revision: 2})
    })

    test('lets exactly one of two concurrent writers holding the same revision through', async () => {
        const username = await insertUser()

        const outcomes = await Promise.all([
            repository.updateUserDetails({...details(username), name: 'First', revision: 1}),
            repository.updateUserDetails({...details(username), name: 'Second', revision: 1})
        ])

        const user = await repository.findByUsername(username)
        expect(outcomes.filter(Boolean)).toHaveLength(1)
        expect(user.revision).toBe(2)
        expect(['First', 'Second']).toContain(user.name)
    })

    test('writes unconditionally when no revision is given', async () => {
        const username = await insertUser()
        await repository.updateUserDetails({...details(username), name: 'Robert', revision: 1})

        const updated = await repository.updateUserDetails({...details(username), name: 'Bobby'})

        const user = await repository.findByUsername(username)
        expect(updated).toBe(true)
        expect(user).toMatchObject({name: 'Bobby', revision: 3})
    })

    test('a status change bumps the revision too', async () => {
        const username = await insertUser()

        await repository.updateStatus(username, 'LOCKED')

        const user = await repository.findByUsername(username)
        expect(user).toMatchObject({status: 'LOCKED', revision: 2})
    })

    test('a login does not bump the revision', async () => {
        const username = await insertUser()

        await repository.setLastLoginTime(username)

        const user = await repository.findByUsername(username)
        expect(user.revision).toBe(1)
    })

    const insertUser = async () => {
        const username = `user${randomBytes(4).toString('hex')}`
        await repository.insertUser({username, name: 'Bob', email: `${username}@example.org`, organization: 'FAO', token: username})
        return username
    }

    const details = username => ({
        username, name: 'Bob', email: `${username}@example.org`, organization: 'FAO', intendedUse: null,
        emailNotificationsEnabled: true, manualMapRenderingEnabled: false, admin: false
    })
})
