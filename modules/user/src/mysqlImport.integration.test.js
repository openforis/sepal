import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql, StaleImportError} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('user import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'user_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'user_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const user = aUser({
            name: 'Café 😀 漢字', organization: 'Ünïcode', intended_use: 'Forest 😀', admin: 1,
            google_legacy_project: 1, uid: 10007, gid: 10008, revision: 4,
            last_login_time: new Date('2026-03-04T05:06:07Z')
        })
        const key = aKey({name: 'Laptop 😀'})
        await seedUser(user)
        await seedKey(key)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await importedUsers(target), [expectedUser(user)])
        assert.deepEqual(await importedKeys(target), [key])
    })

    test('continues the identity sequences past the imported ids', async () => {
        await seedUser(aUser({id: 41, username: 'bob', email: 'bob@example.org'}))
        await seedKey(aKey({id: 17}))
        await importFromMysql(importOf(source, target))

        const {rows: [{id: userId}]} = await target.query(
            `INSERT INTO sepal_user (username, admin, "system_user", status)
             VALUES ('new', false, false, 'PENDING') RETURNING id`)
        const {rows: [{id: keyId}]} = await target.query(
            `INSERT INTO ssh_key (username, name, key_type, public_key, fingerprint)
             VALUES ('new', 'n', 'ssh-ed25519', 'AAAA', 'SHA256:new') RETURNING id`)

        assert.deepEqual({userId, keyId}, {userId: 42, keyId: 18})
    })

    test('continues the user sequence past the imported uids and gids', async () => {
        await seedUser(aUser({id: 41, uid: 10007, gid: 10008}))
        await importFromMysql(importOf(source, target))

        const {rows: [{id}]} = await target.query(
            `INSERT INTO sepal_user (username, admin, "system_user", status)
             VALUES ('new', false, false, 'PENDING') RETURNING id`)

        assert.equal(id, 10009)
    })

    test('refuses to start after a change to sepal_user', async () => {
        await seedUser(aUser())
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE sepal_user SET last_login_time = NOW() WHERE username = ?', ['bob'])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to ssh_key', async () => {
        await seedKey(aKey())
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE ssh_key SET name = ? WHERE username = ?', ['Renamed', 'bob'])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    const seedUser = user => {
        const columns = Object.keys(user)
        return source.query(
            `INSERT INTO sepal_user (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            Object.values(user)
        )
    }

    const seedKey = key => {
        const columns = Object.keys(key)
        return source.query(
            `INSERT INTO ssh_key (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            Object.values(key)
        )
    }
})

const aUser = overrides => ({
    id: 1,
    username: 'bob',
    name: 'Bob',
    email: 'bob@example.org',
    organization: null,
    token: 'a-token',
    admin: 0,
    system_user: 0,
    status: 'ACTIVE',
    intended_use: null,
    google_legacy_project: 0,
    password_hash: 'a-hash',
    uid: null,
    gid: null,
    revision: 1,
    ...overrides
})

const aKey = overrides => ({
    id: 1,
    username: 'bob',
    name: 'Laptop',
    key_type: 'ssh-ed25519',
    public_key: 'AAAAC3NzaC1lZDI1NTE5AAAAIFTTtG0hPe95rIxeTXi4nSx4CHf59bz6WQ6e8K0fhOWn',
    fingerprint: 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM',
    ...overrides
})

const expectedUser = user => ({
    ...user,
    admin: !!user.admin,
    system_user: !!user.system_user,
    google_legacy_project: !!user.google_legacy_project,
    last_login_time: user.last_login_time ?? null
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

const importedUsers = async target => {
    const {rows} = await target.query(`
        SELECT id, username, name, email, organization, token, admin, "system_user", status, intended_use,
               google_legacy_project, password_hash, uid, gid, revision, last_login_time
        FROM sepal_user ORDER BY id`)
    return rows
}

const importedKeys = async target => {
    const {rows} = await target.query('SELECT id, username, name, key_type, public_key, fingerprint FROM ssh_key ORDER BY id')
    return rows
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
