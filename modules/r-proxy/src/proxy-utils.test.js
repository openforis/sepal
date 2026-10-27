import assert from 'node:assert/strict'
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import http from 'node:http'
import {tmpdir} from 'node:os'
import Path from 'node:path'
import {PassThrough} from 'node:stream'
import {after, before, describe, it} from 'node:test'

import {checkTarget, forwardAndCache} from './proxy-utils.js'

describe('checkTarget', () => {
    it('rejects when the target cannot be reached', async () => {
        const port = await unusedPort()

        await assert.rejects(checkTarget(`https://127.0.0.1:${port}/package.tar.gz`), {code: 'ECONNREFUSED'})
    })
})

describe('forwardAndCache', () => {
    let upstream
    let dir

    before(async () => {
        upstream = await startUpstream()
        dir = await mkdtemp(Path.join(tmpdir(), 'r-proxy-'))
    })

    after(async () => {
        upstream.close()
        await rm(dir, {recursive: true, force: true})
    })

    it('forwards the response and caches it at the path', async () => {
        const path = Path.join(dir, 'single', 'pkg_1.0.tar.gz')
        const res = collector()

        await forwardAndCache({proxyRes: await upstream.get('/complete'), res, path})

        assert.equal(res.body(), BODY)
        assert.equal(await readFile(path, 'utf8'), BODY)
    })

    it('caches two concurrent responses for the same path', async () => {
        const path = Path.join(dir, 'concurrent', 'pkg_1.0.tar.gz')
        const [first, second] = await Promise.all([upstream.get('/complete'), upstream.get('/complete')])

        await Promise.all([
            forwardAndCache({proxyRes: first, res: collector(), path}),
            forwardAndCache({proxyRes: second, res: collector(), path})
        ])

        assert.equal(await readFile(path, 'utf8'), BODY)
        assert.deepEqual(await readdir(Path.dirname(path)), ['pkg_1.0.tar.gz'])
    })

    it('rejects and caches nothing when the upstream connection breaks', async () => {
        const path = Path.join(dir, 'broken', 'pkg_1.0.tar.gz')

        await assert.rejects(forwardAndCache({proxyRes: await upstream.get('/broken'), res: collector(), path}))

        assert.deepEqual(await readdir(Path.dirname(path)), [])
    })
})

const BODY = 'package content '.repeat(10000)

const startUpstream = async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/broken') {
            res.writeHead(200, {'Content-Length': BODY.length * 2})
            res.write(BODY, () => res.destroy())
        } else {
            res.end(BODY)
        }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address()
    return {
        get: path => new Promise((resolve, reject) =>
            http.get(`http://127.0.0.1:${port}${path}`, {agent: false}, resolve).on('error', reject)
        ),
        close: () => server.close()
    }
}

const collector = () => {
    const chunks = []
    const stream = new PassThrough()
    stream.on('data', chunk => chunks.push(chunk))
    stream.body = () => Buffer.concat(chunks).toString()
    return stream
}

const unusedPort = async () => {
    const server = http.createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address()
    await new Promise(resolve => server.close(resolve))
    return port
}
