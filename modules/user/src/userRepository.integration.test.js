import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {DuplicateUserError, UserRepository} from './userRepository.js'

// Rows are written directly only where no operation can produce them: the POSIX identities, system
// accounts and creation times that came from the legacy import, which several reads select on.

describe('UserRepository', () => {
    let testDb
    let repository

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'user_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new UserRepository(testDb.db)
    })

    after(() => testDb?.remove())

    describe('insertUser', () => {
        test('stores a new user as pending, with the username in lowercase', async () => {
            await repository.insertUser(aUser({username: 'Bob', name: 'Bob Bobson', organization: 'FAO'}))

            const stored = await repository.findByUsername('bob')
            assert.equal(stored.username, 'bob')
            assert.equal(stored.name, 'Bob Bobson')
            assert.equal(stored.organization, 'FAO')
            assert.equal(stored.status, 'PENDING')
            assert.equal(stored.emailNotificationsEnabled, true)
            assert.equal(stored.admin, false)
            assert.equal(stored.systemUser, false)
        })

        test('starts a new user at revision 1', async () => {
            await repository.insertUser(aUser())

            const stored = await repository.findByUsername(USERNAME)

            assert.equal(stored.revision, 1)
        })

        test('gives the new user a posix identity derived from the id it returns', async () => {
            const id = await repository.insertUser(aUser())

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.id, id)
            assert.equal(stored.uid, id)
            assert.equal(stored.gid, id)
        })

        test('refuses an email another user has, whatever its case', async () => {
            await repository.insertUser(aUser())

            await assert.rejects(
                repository.insertUser(aUser({username: 'alice', email: EMAIL.toUpperCase()})),
                DuplicateUserError
            )

            assert.equal(await repository.findByUsername('alice'), null)
        })
    })

    describe('assignDerivedPosixIds', () => {
        test('fills a posix identity that is missing', async () => {
            const imported = await givenImportedUser({username: USERNAME, uid: null, gid: null})

            await repository.assignDerivedPosixIds(imported.id)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.uid, imported.id)
            assert.equal(stored.gid, imported.id)
        })

        // The uid and gid migrated from LDAP own the files on disk; overwriting either would orphan them.
        test('leaves a posix identity that is already set', async () => {
            const imported = await givenImportedUser({username: USERNAME, uid: 10001, gid: 10002})

            await repository.assignDerivedPosixIds(imported.id)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.uid, 10001)
            assert.equal(stored.gid, 10002)
        })
    })

    describe('findByUsername', () => {
        test('finds a user whatever case the name is given in', async () => {
            await repository.insertUser(aUser({username: USERNAME}))

            const stored = await repository.findByUsername(USERNAME.toUpperCase())

            assert.equal(stored.username, USERNAME)
        })

        test('reports nothing for a name it does not know', async () => {
            const stored = await repository.findByUsername('nobody')

            assert.equal(stored, null)
        })
    })

    describe('findByEmail', () => {
        test('finds a user whatever case the address is given in', async () => {
            await repository.insertUser(aUser({email: 'Bob@Example.org'}))

            const stored = await repository.findByEmail('bob@example.ORG')

            assert.equal(stored.username, USERNAME)
            assert.equal(stored.email, 'Bob@Example.org')
        })
    })

    describe('findByToken', () => {
        test('finds the user holding the token', async () => {
            await repository.insertUser(aUser({token: 'the-token'}))

            const stored = await repository.findByToken('the-token')

            assert.equal(stored.username, USERNAME)
        })
    })

    describe('updateToken', () => {
        test('issues a new token and stamps when it was issued', async () => {
            await givenImportedUser({username: USERNAME, token: 'old-token', token_generation_time: LONG_AGO})

            await repository.updateToken(USERNAME, 'new-token')

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.token, 'new-token')
            assert.ok(stored.tokenGenerationTime > LONG_AGO.getTime())
        })
    })

    describe('listUsers', () => {
        test('lists users newest first', async () => {
            await givenImportedUser({username: 'older', creation_time: LONG_AGO})
            await givenImportedUser({username: 'newer', creation_time: RECENTLY})

            const users = await repository.listUsers()

            assert.deepEqual(users.map(({username}) => username), ['newer', 'older'])
        })

        test('leaves out system users', async () => {
            await repository.insertUser(aUser())
            await givenImportedUser({username: 'sepaladmin', system_user: 1})

            const users = await repository.listUsers()

            assert.deepEqual(users.map(({username}) => username), [USERNAME])
        })
    })

    describe('listIdentities', () => {
        test('lists the users that have a posix identity, lowest uid first', async () => {
            await givenImportedUser({username: 'second', uid: 10002, gid: 10002, name: 'Second'})
            await givenImportedUser({username: 'first', uid: 10001, gid: 10001, name: 'First'})

            const identities = await repository.listIdentities()

            assert.deepEqual(
                identities.map(({username, uid, gid, name}) => ({username, uid, gid, name})),
                [
                    {username: 'first', uid: 10001, gid: 10001, name: 'First'},
                    {username: 'second', uid: 10002, gid: 10002, name: 'Second'}
                ]
            )
        })

        // A pending user has no home directory yet, and uids below the POSIX range belong to the host.
        // Locked users keep their identity: locking is enforced at authentication, not in NSS.
        test('leaves out pending users and identities below the posix range', async () => {
            await givenImportedUser({username: 'pending', uid: 10003, gid: 10003, status: 'PENDING'})
            await givenImportedUser({username: 'reserved', uid: 999, gid: 999})
            await givenImportedUser({username: 'locked', uid: 10004, gid: 10004, status: 'LOCKED'})

            const identities = await repository.listIdentities()

            assert.deepEqual(identities.map(({username}) => username), ['locked'])
        })
    })

    describe('emailNotificationsEnabled', () => {
        test('reports the choice stored for the address', async () => {
            await repository.insertUser(aUser({email: EMAIL}))

            const beforeOptOut = await repository.emailNotificationsEnabled(EMAIL)
            await repository.updateUserDetails(details({emailNotificationsEnabled: false}))
            const afterOptOut = await repository.emailNotificationsEnabled(EMAIL)

            assert.equal(beforeOptOut, true)
            assert.equal(afterOptOut, false)
        })

        test('reports false for an address it does not know', async () => {
            const enabled = await repository.emailNotificationsEnabled('nobody@example.org')

            assert.equal(enabled, false)
        })
    })

    describe('login times', () => {
        test('reports no login time until the user has logged in', async () => {
            await repository.insertUser(aUser())

            const login = await repository.mostRecentLogin(USERNAME)
            const logins = await repository.mostRecentLoginByUser()
            assert.deepEqual(login, {})
            assert.deepEqual(logins, {})
        })

        test('reports when the user last logged in', async () => {
            await repository.insertUser(aUser())

            await repository.setLastLoginTime(USERNAME)

            const login = await repository.mostRecentLogin(USERNAME)
            const stored = await repository.findByUsername(USERNAME)
            assert.equal(Date.parse(login.timestamp), stored.lastLoginTime)
            assert.equal(login.timestamp, new Date(stored.lastLoginTime).toISOString())
        })

        // A login records activity, not a change to the record, so it must not invalidate an edit
        // its owner is holding.
        test('leaves the revision alone', async () => {
            await repository.insertUser(aUser())

            await repository.setLastLoginTime(USERNAME)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.revision, 1)
        })

        test('reports the login times of every non-system user that has logged in', async () => {
            await repository.insertUser(aUser())
            await givenImportedUser({username: 'sepaladmin', system_user: 1})
            await repository.setLastLoginTime(USERNAME)
            await repository.setLastLoginTime('sepaladmin')

            const logins = await repository.mostRecentLoginByUser()

            assert.deepEqual(Object.keys(logins), [USERNAME])
        })
    })

    describe('updateGoogleTokens', () => {
        test('stores the google tokens', async () => {
            await repository.insertUser(aUser())

            await repository.updateGoogleTokens(USERNAME, GOOGLE_TOKENS)

            const stored = await repository.findByUsername(USERNAME)
            assert.deepEqual(stored.googleTokens, {
                accessToken: GOOGLE_TOKENS.accessToken,
                accessTokenExpiryDate: GOOGLE_TOKENS.accessTokenExpiryDate,
                refreshToken: GOOGLE_TOKENS.refreshToken,
                projectId: GOOGLE_TOKENS.projectId,
                legacyProject: true
            })
        })

        test('clears the google tokens', async () => {
            await repository.insertUser(aUser())
            await repository.updateGoogleTokens(USERNAME, GOOGLE_TOKENS)

            await repository.updateGoogleTokens(USERNAME, null)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.googleTokens, null)
        })
    })

    describe('updateUserDetails', () => {
        test('replaces the details of the named user', async () => {
            await repository.insertUser(aUser())

            await repository.updateUserDetails(details({
                name: 'Renamed', email: 'renamed@example.org', organization: 'FAO', intendedUse: 'research',
                manualMapRenderingEnabled: true, admin: true
            }))

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.name, 'Renamed')
            assert.equal(stored.email, 'renamed@example.org')
            assert.equal(stored.organization, 'FAO')
            assert.equal(stored.intendedUse, 'research')
            assert.equal(stored.manualMapRenderingEnabled, true)
            assert.equal(stored.admin, true)
            assert.deepEqual(stored.roles, ['application_admin'])
        })

        test('reports the write and bumps the revision when the caller holds the current one', async () => {
            await repository.insertUser(aUser())

            const updated = await repository.updateUserDetails(details({name: 'Robert', revision: 1}))

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(updated, true)
            assert.partialDeepStrictEqual(stored, {name: 'Robert', revision: 2})
        })

        test('writes nothing when the caller holds a stale revision', async () => {
            await repository.insertUser(aUser())
            await repository.updateUserDetails(details({name: 'Robert', revision: 1}))

            const updated = await repository.updateUserDetails(details({name: 'Bobby', revision: 1}))

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(updated, false)
            assert.partialDeepStrictEqual(stored, {name: 'Robert', revision: 2})
        })

        test('writes unconditionally when no revision is given', async () => {
            await repository.insertUser(aUser())
            await repository.updateUserDetails(details({name: 'Robert', revision: 1}))

            const updated = await repository.updateUserDetails(details({name: 'Bobby'}))

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(updated, true)
            assert.partialDeepStrictEqual(stored, {name: 'Bobby', revision: 3})
        })

        test('refuses an email another user has, leaving the details as they were', async () => {
            await repository.insertUser(aUser())
            await repository.insertUser(aUser({username: 'alice', email: 'alice@example.org', token: 'alice-token'}))

            await assert.rejects(
                repository.updateUserDetails(details({name: 'Robert', email: 'Alice@Example.org'})),
                DuplicateUserError
            )

            const stored = await repository.findByUsername(USERNAME)
            assert.partialDeepStrictEqual(stored, {name: 'Bob', email: EMAIL, revision: 1})
        })

        test('voids the reset token when the email changes', async () => {
            await repository.insertUser(aUser({token: 'the-token'}))

            await repository.updateUserDetails(details({email: 'renamed@example.org'}))

            const byToken = await repository.findByToken('the-token')
            assert.equal(byToken, null)
        })

        test('keeps the reset token when the email stays the same', async () => {
            await repository.insertUser(aUser({token: 'the-token'}))

            await repository.updateUserDetails(details({name: 'Robert'}))

            const byToken = await repository.findByToken('the-token')
            assert.equal(byToken.username, USERNAME)
        })
    })

    describe('updatePassword', () => {
        test('replaces the stored password hash', async () => {
            await repository.insertUser(aUser())

            await repository.updatePassword(USERNAME, '{SCRYPT}hash')

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.passwordHash, '{SCRYPT}hash')
        })

        test('voids the reset token, keeping the user', async () => {
            await repository.insertUser(aUser({token: 'the-token'}))

            await repository.updatePassword(USERNAME, '{SCRYPT}hash')

            const byToken = await repository.findByToken('the-token')
            const byUsername = await repository.findByUsername(USERNAME)
            assert.equal(byToken, null)
            assert.equal(byUsername.token, null)
        })
    })

    describe('updateStatus', () => {
        test('changes the status of the named user', async () => {
            await repository.insertUser(aUser())

            await repository.updateStatus(USERNAME, 'ACTIVE')

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.status, 'ACTIVE')
        })

        // Optimistic locking covers the whole record, not just the details endpoint that checks it.
        test('bumps the revision, so an edit made before the status changed is stale', async () => {
            await repository.insertUser(aUser())

            await repository.updateStatus(USERNAME, 'LOCKED')

            const stored = await repository.findByUsername(USERNAME)
            assert.partialDeepStrictEqual(stored, {status: 'LOCKED', revision: 2})
        })
    })

    describe('acceptPrivacyPolicy', () => {
        test('records that the user accepted the privacy policy', async () => {
            await repository.insertUser(aUser())

            await repository.acceptPrivacyPolicy(USERNAME)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.privacyPolicyAccepted, true)
        })
    })

    describe('updateSshPublicKey', () => {
        test('stores the ssh public key of the named user', async () => {
            await repository.insertUser(aUser())

            await repository.updateSshPublicKey(USERNAME, 'ssh-ed25519 AAAA')

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.sshPublicKey, 'ssh-ed25519 AAAA')
        })
    })

    // `[0]` reaches SQL as `WHERE token = 0`, which MySQL matches by coercing the varchar column (see
    // isText in validation.js). The seeded name, address and token all begin with a letter, so each of
    // them is one MySQL would have coerced into a match.
    describe('a selector that is not a string', () => {
        test('finds no user by name, address or token', async () => {
            await repository.insertUser(aUser())

            const byUsername = await repository.findByUsername(NOT_A_STRING)
            const byEmail = await repository.findByEmail(NOT_A_STRING)
            const byToken = await repository.findByToken(NOT_A_STRING)

            assert.equal(byUsername, null)
            assert.equal(byEmail, null)
            assert.equal(byToken, null)
        })

        test('reads as an address and a name that are not stored', async () => {
            await repository.insertUser(aUser())
            await repository.setLastLoginTime(USERNAME)

            const enabled = await repository.emailNotificationsEnabled(NOT_A_STRING)
            const login = await repository.mostRecentLogin(NOT_A_STRING)

            assert.equal(enabled, false)
            assert.deepEqual(login, {})
        })

        // The failure has to be the repository's own. MySQL refuses the coerced comparison in an UPDATE
        // by itself, but only once the statement has run — too late for a handler that has already
        // committed the writes before it.
        test('refuses every credential write, leaving the account as it was', async () => {
            await repository.insertUser(aUser())
            const before = await repository.findByUsername(USERNAME)

            await assert.rejects(repository.updatePassword(NOT_A_STRING, '{SCRYPT}hash'), REFUSED)
            await assert.rejects(repository.updateStatus(NOT_A_STRING, 'ACTIVE'), REFUSED)
            await assert.rejects(repository.updateToken(NOT_A_STRING, 'new-token'), REFUSED)

            const after = await repository.findByUsername(USERNAME)
            assert.deepEqual(after, before)
        })

        test('refuses every other write that selects a user, leaving the account as it was', async () => {
            await repository.insertUser(aUser())
            const before = await repository.findByUsername(USERNAME)

            await assert.rejects(repository.setLastLoginTime(NOT_A_STRING), REFUSED)
            await assert.rejects(repository.updateUserDetails(details({username: NOT_A_STRING})), REFUSED)
            await assert.rejects(repository.acceptPrivacyPolicy(NOT_A_STRING), REFUSED)
            await assert.rejects(repository.updateGoogleTokens(NOT_A_STRING, GOOGLE_TOKENS), REFUSED)
            await assert.rejects(repository.updateSshPublicKey(NOT_A_STRING, 'ssh-ed25519 AAAA'), REFUSED)

            const after = await repository.findByUsername(USERNAME)
            assert.deepEqual(after, before)
        })
    })

    describe('writers running at the same time', () => {
        let concurrent
        let concurrentRepository

        before(async () => {
            concurrent = await createTestDb({
                name: 'user_repository_concurrent', migrations: MIGRATIONS_PATH, connections: COMPETING_WRITERS
            })
            concurrentRepository = new UserRepository(concurrent.db)
        })

        beforeEach(() => concurrent.reset())

        after(() => concurrent?.remove())

        // Both updates are in flight together; MySQL decides how they interleave. The claim is only
        // that one of them loses, whichever order it settles on — a caller told nothing happened is
        // what lets the details endpoint answer 409 rather than silently drop an edit.
        test('lets exactly one of two writers holding the same revision through', async () => {
            await concurrentRepository.insertUser(aUser())

            const outcomes = await Promise.all([
                concurrentRepository.updateUserDetails(details({name: 'First', revision: 1})),
                concurrentRepository.updateUserDetails(details({name: 'Second', revision: 1}))
            ])

            const stored = await concurrentRepository.findByUsername(USERNAME)
            assert.equal(outcomes.filter(Boolean).length, 1)
            assert.equal(stored.revision, 2)
            assert.ok(['First', 'Second'].includes(stored.name))
        })
    })

    const aUser = (over = {}) => ({
        username: USERNAME, name: 'Bob', email: EMAIL, organization: null, intendedUse: null,
        token: 'a-token', ...over
    })

    const details = (over = {}) => ({
        username: USERNAME, name: 'Bob', email: EMAIL, organization: null, intendedUse: null,
        emailNotificationsEnabled: true, manualMapRenderingEnabled: false, admin: false, ...over
    })

    // Rows as the legacy import left them. Their POSIX identities, system accounts and creation times
    // predate this database, and no operation here can write any of the three.
    const givenImportedUser = async row => {
        const username = row.username
        await testDb.query('INSERT INTO sepal_user SET ?', [{
            name: username, email: `${username}@example.org`, admin: 0, system_user: 0, status: 'ACTIVE',
            uid: null, gid: null, ...row
        }])
        return await repository.findByUsername(username)
    }

    const USERNAME = 'bob'
    const EMAIL = 'bob@example.org'

    // How the coercion arrives over HTTP: a one-element JSON array, which the driver formats as `0`.
    const NOT_A_STRING = [0]
    const REFUSED = /Invalid selector/

    // Enough connections for every writer the concurrency scenario starts at once; queueing stays
    // off, so one more acquisition than this would fail rather than wait.
    const COMPETING_WRITERS = 2

    const LONG_AGO = new Date('2020-01-01T00:00:00Z')
    const RECENTLY = new Date('2026-01-01T00:00:00Z')
    const GOOGLE_TOKENS = {
        accessToken: 'access', refreshToken: 'refresh', projectId: 'a-project',
        accessTokenExpiryDate: new Date('2026-06-01T00:00:00Z').getTime(), legacyProject: true
    }

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
