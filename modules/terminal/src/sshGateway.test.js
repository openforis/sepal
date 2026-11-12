import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const SCRIPT = fileURLToPath(new URL('../script/ssh_gateway.sh', import.meta.url))
const USERNAME = 'alice -oUnused=value'
const KEY_FILE = '/tmp/source key [*].key'
const TMP_KEY_FILE = '/tmp/copy key -oUnused=value.key'
const HOST = 'ssh-gateway'

test('passes key paths and SSH identity as literal arguments', t => {
    const {calls} = runScript(t)

    assert.deepEqual(calls, [
        ['sudo', 'cp', '--', KEY_FILE, TMP_KEY_FILE],
        ['sudo', 'chown', '--', 'node:node', TMP_KEY_FILE],
        ['sudo', 'chmod', '--', '600', TMP_KEY_FILE],
        ['ssh', '-t', '-q', '-o', 'StrictHostKeyChecking=no', '-i', TMP_KEY_FILE, '-l', USERNAME, '--', HOST]
    ])
})

for (const command of ['cp', 'chown', 'chmod']) {
    test(`stops when key preparation fails at ${command}`, t => {
        const {status, calls} = runScript(t, {failPrep: command})

        assert.equal(status, 13)
        assert.equal(calls.at(-1)[1], command)
        assert.equal(calls.some(([name]) => name === 'ssh'), false)
    })
}

test('still reconnects after SSH exits unsuccessfully', t => {
    const {calls} = runScript(t, {sshAttempts: 2})

    assert.equal(calls.filter(([name]) => name === 'ssh').length, 2)
    assert.equal(calls.filter(([name]) => name === 'sudo').length, 3)
})

test('refuses a missing SSH destination before preparing a key', t => {
    const {status, calls} = runScript(t, {host: null})

    assert.notEqual(status, 0)
    assert.deepEqual(calls, [])
})

// Every external command is a stand-in: no sudo, key copying or SSH connection is performed.
const runScript = (t, {failPrep = '', sshAttempts = 1, host = HOST} = {}) => {
    const directory = mkdtempSync(join(tmpdir(), 'terminal-ssh-'))
    t.after(() => rmSync(directory, {recursive: true, force: true}))
    const callLog = join(directory, 'calls.jsonl')
    writeFileSync(callLog, '')
    for (const name of ['sudo', 'ssh', 'date', 'clear', 'sleep']) {
        writeFileSync(join(directory, name), COMMAND_STAND_IN, {mode: 0o755})
    }
    const env = {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        CALL_LOG: callLog,
        FAIL_PREP: failPrep,
        SSH_ATTEMPTS: String(sshAttempts)
    }
    if (host === null) {
        delete env.SSH_GATEWAY_HOST
    } else {
        env.SSH_GATEWAY_HOST = host
    }
    const result = spawnSync('sh', [SCRIPT, USERNAME, KEY_FILE, TMP_KEY_FILE], {
        env, encoding: 'utf8', timeout: 5000
    })
    assert.ifError(result.error)
    const calls = readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    return {...result, calls}
}

const COMMAND_STAND_IN = `#!/usr/bin/env node
const fs = require('node:fs')
const name = process.argv[1].split('/').pop()
if (name === 'date') {
    console.log('100')
} else if (name === 'clear') {
    // End only this test's shell after the requested number of reconnect attempts.
    const calls = fs.readFileSync(process.env.CALL_LOG, 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse)
    if (calls.filter(([name]) => name === 'ssh').length >= Number(process.env.SSH_ATTEMPTS)) {
        process.kill(process.ppid, 'SIGTERM')
    }
} else if (name !== 'sleep') {
    const args = process.argv.slice(2)
    fs.appendFileSync(process.env.CALL_LOG, JSON.stringify([name, ...args]) + '\\n')
    if (name === 'sudo' && args[0] === process.env.FAIL_PREP) process.exit(13)
    if (name === 'ssh') process.exit(255)
}
`
