import {SshKeyApi} from './sshKeyApi.js'

describe('POST /current/ssh-keys', () => {
    test('adds a key, named after its comment when no name is given', async () => {
        const alice = anActiveUser('alice')
        const ctx = request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519} alice@laptop`}})

        await api.add(ctx)

        expect(ctx.status).toBe(201)
        expect(ctx.body).toEqual({
            id: expect.any(Number), name: 'alice@laptop', type: 'ssh-ed25519',
            fingerprint: ED25519_FINGERPRINT, creationTime: CREATION_TIME
        })
        expect(await listed(alice)).toEqual([ctx.body])
    })

    test('emails the user a notice naming the added key', async () => {
        const alice = anActiveUser('alice')
        const ctx = request(alice, {body: {name: 'Laptop', publicKey: `ssh-ed25519 ${ED25519}`}})

        await api.add(ctx)

        expect(notices).toEqual([{user: alice, key: expect.objectContaining({id: ctx.body.id, name: 'Laptop'})}])
    })

    test('keeps the key when the notice cannot be sent', async () => {
        const alice = anActiveUser('alice')
        failNotices()
        const ctx = request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}})

        await api.add(ctx)

        expect(ctx.status).toBe(201)
        expect(await listed(alice)).toHaveLength(1)
    })

    test('refuses an invalid key with its code, storing nothing', async () => {
        const alice = anActiveUser('alice')
        const ctx = request(alice, {body: {publicKey: `no-pty ssh-ed25519 ${ED25519}`}})

        await api.add(ctx)

        expect(ctx.status).toBe(400)
        expect(ctx.body).toEqual({code: 'INVALID_KEY'})
        expect(await listed(alice)).toEqual([])
        expect(notices).toEqual([])
    })

    test('refuses a key the user already has', async () => {
        const alice = anActiveUser('alice')
        await api.add(request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}}))
        const ctx = request(alice, {body: {name: 'Again', publicKey: `ssh-ed25519 ${ED25519}`}})

        await api.add(ctx)

        expect(ctx.status).toBe(400)
        expect(ctx.body).toEqual({code: 'DUPLICATE_KEY'})
        expect(await listed(alice)).toHaveLength(1)
    })

    test('refuses a key beyond the twentieth', async () => {
        const alice = anActiveUser('alice')
        givenStoredKeys(alice, 20)
        const ctx = request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}})

        await api.add(ctx)

        expect(ctx.status).toBe(400)
        expect(ctx.body).toEqual({code: 'TOO_MANY_KEYS'})
        expect(await listed(alice)).toHaveLength(20)
    })
})

describe('GET /current/ssh-keys', () => {
    test('lists only the current user\'s keys', async () => {
        const alice = anActiveUser('alice')
        const bob = anActiveUser('bob')
        await api.add(request(bob, {body: {publicKey: `ssh-ed25519 ${ED25519}`}}))
        const ctx = request(alice)

        await api.list(ctx)

        expect(ctx.body).toEqual([])
    })
})

describe('DELETE /current/ssh-keys/:id', () => {
    test('removes the user\'s key', async () => {
        const alice = anActiveUser('alice')
        const added = request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}})
        await api.add(added)
        const ctx = request(alice, {params: {id: String(added.body.id)}})

        await api.remove(ctx)

        expect(ctx.status).toBe(204)
        expect(await listed(alice)).toEqual([])
    })

    test('answers not found for another user\'s key, leaving it in place', async () => {
        const alice = anActiveUser('alice')
        const bob = anActiveUser('bob')
        const added = request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}})
        await api.add(added)
        const ctx = request(bob, {params: {id: String(added.body.id)}})

        await api.remove(ctx)

        expect(ctx.status).toBe(404)
        expect(await listed(alice)).toHaveLength(1)
    })

    test('answers not found for an id that is not a number', async () => {
        const ctx = request(anActiveUser('alice'), {params: {id: '1 OR 1=1'}})

        await api.remove(ctx)

        expect(ctx.status).toBe(404)
    })
})

describe('GET /auth/authorized-keys', () => {
    test('lists the SEPAL key, then each user key as its type and key only', async () => {
        const alice = anActiveUser('alice', {sshPublicKey: SEPAL_KEY})
        await api.add(request(alice, {body: {name: 'Laptop', publicKey: `ssh-ed25519 ${ED25519} alice@laptop`}}))
        const ctx = authorizedKeysRequest(alice.username)

        await api.authorizedKeys(ctx)

        expect(ctx.type).toBe('text/plain')
        expect(ctx.body).toBe(`${SEPAL_KEY}\nssh-ed25519 ${ED25519}\n`)
    })

    test('lists the user keys when there is no SEPAL key', async () => {
        const alice = anActiveUser('alice', {sshPublicKey: null})
        await api.add(request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}}))
        const ctx = authorizedKeysRequest(alice.username)

        await api.authorizedKeys(ctx)

        expect(ctx.body).toBe(`ssh-ed25519 ${ED25519}\n`)
    })

    test('lists nothing for a user who is not active', async () => {
        const alice = anActiveUser('alice', {sshPublicKey: SEPAL_KEY})
        await api.add(request(alice, {body: {publicKey: `ssh-ed25519 ${ED25519}`}}))
        users.set('alice', {...alice, status: 'LOCKED'})
        const ctx = authorizedKeysRequest(alice.username)

        await api.authorizedKeys(ctx)

        expect(ctx.body).toBe('')
    })

    test('lists nothing for an unknown user', async () => {
        const ctx = authorizedKeysRequest('nobody')

        await api.authorizedKeys(ctx)

        expect(ctx.body).toBe('')
    })
})

let users
let keys
let notices
let noticesFail

beforeEach(() => {
    users = new Map()
    keys = []
    notices = []
    noticesFail = false
})

const userRepository = {
    findByUsername: async username => users.get(username.toLowerCase()) ?? null
}

// In memory, with the real repository's contract: null for a fingerprint the user already has.
const sshKeyRepository = {
    list: async username => keys.filter(key => key.username === username.toLowerCase()).map(withoutOwner),
    count: async username => keys.filter(key => key.username === username.toLowerCase()).length,
    add: async (username, key) => {
        const owner = username.toLowerCase()
        if (keys.some(stored => stored.username === owner && stored.fingerprint === key.fingerprint)) {
            return null
        }
        const stored = {...key, id: keys.length + 1, username: owner, creationTime: CREATION_TIME}
        keys.push(stored)
        return withoutOwner(stored)
    },
    remove: async (username, id) => {
        const index = keys.findIndex(key => key.id === id && key.username === username.toLowerCase())
        return index >= 0 && keys.splice(index, 1).length === 1
    }
}

const notifyKeyAdded = (user, key) => {
    if (noticesFail) {
        throw new Error('The message queue is down')
    }
    notices.push({user, key})
}

const api = new SshKeyApi({userRepository, sshKeyRepository, notifyKeyAdded})

const withoutOwner = ({username: _username, ...key}) => key

const failNotices = () => {
    noticesFail = true
}

const anActiveUser = (username, over = {}) => {
    const user = {username, name: username, email: `${username}@example.org`, status: 'ACTIVE', sshPublicKey: null, ...over}
    users.set(username, user)
    return user
}

const givenStoredKeys = (user, count) => {
    for (let i = 0; i < count; i++) {
        keys.push({id: keys.length + 1, username: user.username, name: `Key ${i}`, type: 'ssh-ed25519',
            publicKey: 'AAAA', fingerprint: `SHA256:seed${i}`, creationTime: CREATION_TIME})
    }
}

const listed = async user => {
    const ctx = request(user)
    await api.list(ctx)
    return ctx.body
}

const request = (user, {body = {}, params = {}} = {}) => ({
    state: {currentUser: {username: user.username, roles: []}},
    request: {body},
    params,
    query: {}
})

const authorizedKeysRequest = username => ({query: {username}, state: {}, request: {}, params: {}})

const ED25519 = 'AAAAC3NzaC1lZDI1NTE5AAAAIFTTtG0hPe95rIxeTXi4nSx4CHf59bz6WQ6e8K0fhOWn'
const ED25519_FINGERPRINT = 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM'
const SEPAL_KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDsepal sepal-generated'
const CREATION_TIME = '2026-09-28T10:00:00.000Z'
