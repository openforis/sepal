import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, before, describe, test} from 'node:test'

describe('resize', () => {
    let homeDir
    let Session
    let Terminal

    before(async () => {
        homeDir = await mkdtemp(join(tmpdir(), 'terminal-'))
        process.env.IP = '127.0.0.1'
        process.env.HOME_DIR = homeDir
        process.env.SSH_SCRIPT_PATH = join(homeDir, 'ssh-script')
        Session = await import('./session.js')
        Terminal = await import('./terminal.js')
    })

    after(() => rm(homeDir, {recursive: true, force: true}))

    test('rejects a session that was never started, without creating it', () => {
        const req = aResizeRequest({sessionId: 'unknown-session'})
        const res = aResponse()

        Terminal.resize(req, res)

        assert.equal(res.statusCode, 404)
        assert.equal(Session.find('unknown-session'), undefined)
    })
})

const aResizeRequest = ({sessionId}) => ({
    params: {sessionId},
    query: {cols: '120', rows: '40'},
    headers: {'sepal-user': JSON.stringify({username: 'alice'})}
})

const aResponse = () => {
    const res = {
        statusCode: null,
        status: code => {
            res.statusCode = code
            return res
        },
        end: () => res
    }
    return res
}
