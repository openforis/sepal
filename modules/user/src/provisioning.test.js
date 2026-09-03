import {createProvisioning} from './provisioning.js'

test('provision shells out to sudo provision-user with username + uid + gid and returns the trimmed pubkey', async () => {
    const calls = []
    const exec = async (cmd, args) => { calls.push([cmd, args]); return {stdout: 'ssh-rsa AAAAKEY comment\n', stderr: ''} }
    const {provision} = createProvisioning(exec)
    const pubkey = await provision('lookap1', 10006, 10031)
    expect(calls).toEqual([['sudo', ['/usr/local/bin/provision-user', 'lookap1', '10006', '10031']]])
    expect(pubkey).toBe('ssh-rsa AAAAKEY comment')
})
