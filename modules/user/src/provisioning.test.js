import assert from 'node:assert/strict'
import {test} from 'node:test'

import {createProvisioning} from './provisioning.js'

test('provision shells out to sudo provision-user with username + uid + gid and returns the trimmed pubkey', async () => {
    const calls = []
    const exec = async (cmd, args) => { calls.push([cmd, args]); return {stdout: 'ssh-rsa AAAAKEY comment\n', stderr: ''} }
    const {provision} = createProvisioning(exec)
    const pubkey = await provision('lookap1', 10006, 10031)
    assert.deepEqual(
        calls,
        [['sudo', ['/usr/local/bin/provision-user', 'lookap1', '10006', '10031']]]
    )
    assert.equal(pubkey, 'ssh-rsa AAAAKEY comment')
})
