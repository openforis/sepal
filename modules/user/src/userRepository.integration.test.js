import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {UserRepository} from './userRepository.js'

// Rows are written directly only where no operation can produce them: the POSIX identities, system
// accounts and creation times that came from the legacy import, which several reads select on.

describe('UserRepository', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'user_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new UserRepository(testDb.db)
    })

    afterAll(() => testDb?.remove())

    describe('insertUser', () => {
        test('stores a new user as pending, with the username in lowercase', async () => {
            await repository.insertUser(aUser({username: 'Bob', name: 'Bob Bobson', organization: 'FAO'}))

            const stored = await repository.findByUsername('bob')
            expect(stored.username).toBe('bob')
            expect(stored.name).toBe('Bob Bobson')
            expect(stored.organization).toBe('FAO')
            expect(stored.status).toBe('PENDING')
            expect(stored.emailNotificationsEnabled).toBe(true)
            expect(stored.admin).toBe(false)
            expect(stored.systemUser).toBe(false)
        })

        test('gives the new user a posix identity derived from the id it returns', async () => {
            const id = await repository.insertUser(aUser())

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.id).toBe(id)
            expect(stored.uid).toBe(id)
            expect(stored.gid).toBe(id)
        })
    })

    describe('assignDerivedPosixIds', () => {
        test('fills a posix identity that is missing', async () => {
            const imported = await givenImportedUser({username: USERNAME, uid: null, gid: null})

            await repository.assignDerivedPosixIds(imported.id)

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.uid).toBe(imported.id)
            expect(stored.gid).toBe(imported.id)
        })

        // The uid and gid migrated from LDAP own the files on disk; overwriting either would orphan them.
        test('leaves a posix identity that is already set', async () => {
            const imported = await givenImportedUser({username: USERNAME, uid: 10001, gid: 10002})

            await repository.assignDerivedPosixIds(imported.id)

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.uid).toBe(10001)
            expect(stored.gid).toBe(10002)
        })
    })

    describe('findByUsername', () => {
        test('finds a user whatever case the name is given in', async () => {
            await repository.insertUser(aUser({username: USERNAME}))

            const stored = await repository.findByUsername(USERNAME.toUpperCase())

            expect(stored.username).toBe(USERNAME)
        })

        test('reports nothing for a name it does not know', async () => {
            const stored = await repository.findByUsername('nobody')

            expect(stored).toBeNull()
        })
    })

    describe('findByEmail', () => {
        test('finds a user whatever case the address is given in', async () => {
            await repository.insertUser(aUser({email: 'Bob@Example.org'}))

            const stored = await repository.findByEmail('bob@example.ORG')

            expect(stored.username).toBe(USERNAME)
            expect(stored.email).toBe('Bob@Example.org')
        })
    })

    describe('findByToken', () => {
        test('finds the user holding the token', async () => {
            await repository.insertUser(aUser({token: 'the-token'}))

            const stored = await repository.findByToken('the-token')

            expect(stored.username).toBe(USERNAME)
        })

        test('stops finding the user once the token is invalidated, keeping the user', async () => {
            await repository.insertUser(aUser({token: 'the-token'}))

            await repository.invalidateToken('the-token')

            const byToken = await repository.findByToken('the-token')
            const byUsername = await repository.findByUsername(USERNAME)
            expect(byToken).toBeNull()
            expect(byUsername.token).toBeNull()
        })
    })

    describe('updateToken', () => {
        test('issues a new token and stamps when it was issued', async () => {
            await givenImportedUser({username: USERNAME, token: 'old-token', token_generation_time: LONG_AGO})

            await repository.updateToken(USERNAME, 'new-token')

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.token).toBe('new-token')
            expect(stored.tokenGenerationTime).toBeGreaterThan(LONG_AGO.getTime())
        })
    })

    describe('listUsers', () => {
        test('lists users newest first', async () => {
            await givenImportedUser({username: 'older', creation_time: LONG_AGO})
            await givenImportedUser({username: 'newer', creation_time: RECENTLY})

            const users = await repository.listUsers()

            expect(users.map(({username}) => username)).toEqual(['newer', 'older'])
        })

        test('leaves out system users', async () => {
            await repository.insertUser(aUser())
            await givenImportedUser({username: 'sepaladmin', system_user: 1})

            const users = await repository.listUsers()

            expect(users.map(({username}) => username)).toEqual([USERNAME])
        })
    })

    describe('listIdentities', () => {
        test('lists the users that have a posix identity, lowest uid first', async () => {
            await givenImportedUser({username: 'second', uid: 10002, gid: 10002, name: 'Second'})
            await givenImportedUser({username: 'first', uid: 10001, gid: 10001, name: 'First'})

            const identities = await repository.listIdentities()

            expect(identities.map(({username, uid, gid, name}) => ({username, uid, gid, name}))).toEqual([
                {username: 'first', uid: 10001, gid: 10001, name: 'First'},
                {username: 'second', uid: 10002, gid: 10002, name: 'Second'}
            ])
        })

        // A pending user has no home directory yet, and uids below the POSIX range belong to the host.
        // Locked users keep their identity: locking is enforced at authentication, not in NSS.
        test('leaves out pending users and identities below the posix range', async () => {
            await givenImportedUser({username: 'pending', uid: 10003, gid: 10003, status: 'PENDING'})
            await givenImportedUser({username: 'reserved', uid: 999, gid: 999})
            await givenImportedUser({username: 'locked', uid: 10004, gid: 10004, status: 'LOCKED'})

            const identities = await repository.listIdentities()

            expect(identities.map(({username}) => username)).toEqual(['locked'])
        })
    })

    describe('emailNotificationsEnabled', () => {
        test('reports the choice stored for the address', async () => {
            await repository.insertUser(aUser({email: EMAIL}))

            const beforeOptOut = await repository.emailNotificationsEnabled(EMAIL)
            await repository.updateUserDetails(details({emailNotificationsEnabled: false}))
            const afterOptOut = await repository.emailNotificationsEnabled(EMAIL)

            expect(beforeOptOut).toBe(true)
            expect(afterOptOut).toBe(false)
        })

        test('reports false for an address it does not know', async () => {
            const enabled = await repository.emailNotificationsEnabled('nobody@example.org')

            expect(enabled).toBe(false)
        })
    })

    describe('login times', () => {
        test('reports no login time until the user has logged in', async () => {
            await repository.insertUser(aUser())

            const login = await repository.mostRecentLogin(USERNAME)
            const logins = await repository.mostRecentLoginByUser()
            expect(login).toEqual({})
            expect(logins).toEqual({})
        })

        test('reports when the user last logged in', async () => {
            await repository.insertUser(aUser())

            await repository.setLastLoginTime(USERNAME)

            const login = await repository.mostRecentLogin(USERNAME)
            const stored = await repository.findByUsername(USERNAME)
            expect(Date.parse(login.timestamp)).toBe(stored.lastLoginTime)
            expect(login.timestamp).toBe(new Date(stored.lastLoginTime).toISOString())
        })

        test('reports the login times of every non-system user that has logged in', async () => {
            await repository.insertUser(aUser())
            await givenImportedUser({username: 'sepaladmin', system_user: 1})
            await repository.setLastLoginTime(USERNAME)
            await repository.setLastLoginTime('sepaladmin')

            const logins = await repository.mostRecentLoginByUser()

            expect(Object.keys(logins)).toEqual([USERNAME])
        })
    })

    describe('updateGoogleTokens', () => {
        test('stores the google tokens', async () => {
            await repository.insertUser(aUser())

            await repository.updateGoogleTokens(USERNAME, GOOGLE_TOKENS)

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.googleTokens).toEqual({
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
            expect(stored.googleTokens).toBeNull()
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
            expect(stored.name).toBe('Renamed')
            expect(stored.email).toBe('renamed@example.org')
            expect(stored.organization).toBe('FAO')
            expect(stored.intendedUse).toBe('research')
            expect(stored.manualMapRenderingEnabled).toBe(true)
            expect(stored.admin).toBe(true)
            expect(stored.roles).toEqual(['application_admin'])
        })
    })

    describe('updatePassword', () => {
        test('replaces the stored password hash', async () => {
            await repository.insertUser(aUser())

            await repository.updatePassword(USERNAME, '{SCRYPT}hash')

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.passwordHash).toBe('{SCRYPT}hash')
        })
    })

    describe('updateStatus', () => {
        test('changes the status of the named user', async () => {
            await repository.insertUser(aUser())

            await repository.updateStatus(USERNAME, 'ACTIVE')

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.status).toBe('ACTIVE')
        })
    })

    describe('acceptPrivacyPolicy', () => {
        test('records that the user accepted the privacy policy', async () => {
            await repository.insertUser(aUser())

            await repository.acceptPrivacyPolicy(USERNAME)

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.privacyPolicyAccepted).toBe(true)
        })
    })

    describe('updateSshPublicKey', () => {
        test('stores the ssh public key of the named user', async () => {
            await repository.insertUser(aUser())

            await repository.updateSshPublicKey(USERNAME, 'ssh-ed25519 AAAA')

            const stored = await repository.findByUsername(USERNAME)
            expect(stored.sshPublicKey).toBe('ssh-ed25519 AAAA')
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

            expect(byUsername).toBeNull()
            expect(byEmail).toBeNull()
            expect(byToken).toBeNull()
        })

        test('reads as an address and a name that are not stored', async () => {
            await repository.insertUser(aUser())
            await repository.setLastLoginTime(USERNAME)

            const enabled = await repository.emailNotificationsEnabled(NOT_A_STRING)
            const login = await repository.mostRecentLogin(NOT_A_STRING)

            expect(enabled).toBe(false)
            expect(login).toEqual({})
        })

        // The failure has to be the repository's own. MySQL refuses the coerced comparison in an UPDATE
        // by itself, but only once the statement has run — too late for a handler that has already
        // committed the writes before it.
        test('refuses every credential write, leaving the account as it was', async () => {
            await repository.insertUser(aUser())
            const before = await repository.findByUsername(USERNAME)

            await expect(repository.updatePassword(NOT_A_STRING, '{SCRYPT}hash')).rejects.toThrow(REFUSED)
            await expect(repository.updateStatus(NOT_A_STRING, 'ACTIVE')).rejects.toThrow(REFUSED)
            await expect(repository.updateToken(NOT_A_STRING, 'new-token')).rejects.toThrow(REFUSED)
            await expect(repository.invalidateToken(NOT_A_STRING)).rejects.toThrow(REFUSED)

            const after = await repository.findByUsername(USERNAME)
            expect(after).toEqual(before)
        })

        test('refuses every other write that selects a user, leaving the account as it was', async () => {
            await repository.insertUser(aUser())
            const before = await repository.findByUsername(USERNAME)

            await expect(repository.setLastLoginTime(NOT_A_STRING)).rejects.toThrow(REFUSED)
            await expect(repository.updateUserDetails(details({username: NOT_A_STRING}))).rejects.toThrow(REFUSED)
            await expect(repository.acceptPrivacyPolicy(NOT_A_STRING)).rejects.toThrow(REFUSED)
            await expect(repository.updateGoogleTokens(NOT_A_STRING, GOOGLE_TOKENS)).rejects.toThrow(REFUSED)
            await expect(repository.updateSshPublicKey(NOT_A_STRING, 'ssh-ed25519 AAAA')).rejects.toThrow(REFUSED)

            const after = await repository.findByUsername(USERNAME)
            expect(after).toEqual(before)
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
    const REFUSED = 'Invalid selector'
    const LONG_AGO = new Date('2020-01-01T00:00:00Z')
    const RECENTLY = new Date('2026-01-01T00:00:00Z')
    const GOOGLE_TOKENS = {
        accessToken: 'access', refreshToken: 'refresh', projectId: 'a-project',
        accessTokenExpiryDate: new Date('2026-06-01T00:00:00Z').getTime(), legacyProject: true
    }

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
