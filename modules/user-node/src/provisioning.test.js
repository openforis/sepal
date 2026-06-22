import {createProvisioning} from './provisioning.js'

test('provision shells out to sudo provision-user with username + id and returns the trimmed pubkey', async () => {
    const calls = []
    const exec = async (cmd, args) => { calls.push([cmd, args]); return {stdout: 'ssh-rsa AAAAKEY comment\n', stderr: ''} }
    const {provision} = createProvisioning(exec)
    const pubkey = await provision('lookap1', 10006)
    expect(calls).toEqual([['sudo', ['/usr/local/bin/provision-user', 'lookap1', '10006']]])
    expect(pubkey).toBe('ssh-rsa AAAAKEY comment')
})

test('deprovision shells out to sudo deprovision-user with the username', async () => {
    const calls = []
    const exec = async (cmd, args) => { calls.push([cmd, args]); return {stdout: '', stderr: ''} }
    const {deprovision} = createProvisioning(exec)
    await deprovision('lookap1')
    expect(calls).toEqual([['sudo', ['/usr/local/bin/deprovision-user', 'lookap1']]])
})
