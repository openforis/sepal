import {jest} from '@jest/globals'

import {createEnsureProvisioned} from './userProvisioning.js'

const makeDeps = overrides => ({
    findByUsername: jest.fn(async username => ({username, uid: 10001, gid: 20001, sshPublicKey: 'ssh-rsa AAAAKEY'})),
    provision: jest.fn(async () => 'ssh-rsa AAAAKEY'),
    updateSshPublicKey: jest.fn(async () => {}),
    ...overrides
})

test('provisions, stores the key and returns the reloaded user', async () => {
    const deps = makeDeps()
    const user = await createEnsureProvisioned(deps)({username: 'joe', uid: 10001, gid: 20001, sshPublicKey: null})
    expect(deps.provision).toHaveBeenCalledWith('joe', 10001, 20001)
    expect(deps.updateSshPublicKey).toHaveBeenCalledWith('joe', 'ssh-rsa AAAAKEY')
    expect(user.sshPublicKey).toBe('ssh-rsa AAAAKEY')
})

test('provisions even when a key is already stored, so missing filesystem resources are recreated', async () => {
    const deps = makeDeps()
    await createEnsureProvisioned(deps)({username: 'joe', uid: 10001, gid: 20001, sshPublicKey: 'ssh-rsa EXISTING'})
    expect(deps.provision).toHaveBeenCalledWith('joe', 10001, 20001)
    expect(deps.updateSshPublicKey).toHaveBeenCalledWith('joe', 'ssh-rsa AAAAKEY')
})

test('does not invent a POSIX identity when uid/gid is missing', async () => {
    const deps = makeDeps()
    const input = {username: 'joe', uid: null, gid: null, sshPublicKey: null}
    const user = await createEnsureProvisioned(deps)(input)
    expect(deps.provision).not.toHaveBeenCalled()
    expect(user).toBe(input)
})

test('never throws: a provision failure is logged and the user returned unchanged', async () => {
    const deps = makeDeps({provision: jest.fn(async () => {throw new Error('boom')})})
    const input = {username: 'joe', uid: 10001, gid: 20001, sshPublicKey: null}
    const user = await createEnsureProvisioned(deps)(input)
    expect(deps.updateSshPublicKey).not.toHaveBeenCalled()
    expect(user).toBe(input)
})

test('does not store an empty key when provision returns nothing', async () => {
    const deps = makeDeps({provision: jest.fn(async () => '')})
    const input = {username: 'joe', uid: 10001, gid: 20001, sshPublicKey: null}
    const user = await createEnsureProvisioned(deps)(input)
    expect(deps.updateSshPublicKey).not.toHaveBeenCalled()
    expect(user).toBe(input)
})
