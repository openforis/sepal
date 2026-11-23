import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import {tmpdir} from 'node:os'
import Path from 'node:path'
import {after, before, mock, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'

import * as transport from './proxy-utils.js'

let dir
let upstream
let agent
let trusted
let untrusted
let serveCran
let serveGitHub
let onBuild

before(async () => {
    configureNoLogging()
    dir = await mkdtemp(Path.join(tmpdir(), 'r-proxy-tls-'))
    trusted = await certificate('trusted')
    untrusted = await certificate('untrusted')
    upstream = https.createServer(trusted, (_req, res) => res.end(BODY))
    upstream.on('tlsClientError', () => {})
    await listen(upstream)
    agent = new https.Agent({ca: trusted.cert, maxCachedSessions: 0, keepAlive: false})
    const target = `https://127.0.0.1:${upstream.address().port}/package.tar.gz`
    await mock.module('./config.js', {namedExports: {
        CRAN_ROOT: Path.join(dir, 'cran'), GITHUB_ROOT: Path.join(dir, 'github'),
        cranRepo: 'https://cran.r-project.org', libPath: dir, LOCAL_CRAN_REPO: 'http://localhost',
    }})
    const enqueue = async () => onBuild?.()
    await mock.module('./queue.js', {namedExports: {
        enqueueBuildCranPackage: enqueue, enqueueBuildGitHubPackage: enqueue,
    }})
    await mock.module('./proxy-utils.js', {namedExports: {
        ...transport,
        // GET uses a new connection or redirect after a successful HEAD.
        checkTarget: async () => true,
        createProxy: options => {
            const proxy = transport.createProxy({...options, agent})
            return (req, res) => proxy(req, res, target)
        },
    }})
    serveCran = (await import('./proxy-cran.js')).serveCran
    serveGitHub = (await import('./proxy-github.js')).serveGitHub
})

after(async () => {
    agent?.destroy()
    if (upstream) {
        upstream.closeAllConnections()
        await new Promise(resolve => upstream.close(resolve))
    }
    if (dir) await rm(dir, {recursive: true, force: true})
})

for (const kind of ['cran', 'github']) {
    for (const valid of [false, true]) {
        test(`${kind} ${valid ? 'caches a trusted archive' : 'rejects an untrusted archive after successful preflight'}`, {timeout: 10000}, async t => {
            upstream.setSecureContext(valid ? trusted : untrusted)
            const filename = `${valid ? 'trusted' : 'untrusted'}_1.tar.gz`
            const path = kind === 'cran' ? `/src/contrib/${filename}` : `/github/owner/package/archive/${filename}`
            const cached = kind === 'cran'
                ? Path.join(dir, 'cran', path)
                : Path.join(dir, 'github/src', path.slice('/github/'.length))
            let built = false
            const queued = new Promise(resolve => { onBuild = () => { built = true; resolve() } })
            const handler = kind === 'cran' ? serveCran : serveGitHub
            const server = http.createServer((req, res) => handler(req, res).catch(() => transport.serveFailure(res)))
            t.after(() => {
                server.closeAllConnections()
                return new Promise(resolve => server.close(resolve))
            })
            await listen(server)

            const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {signal: AbortSignal.timeout(8000)})
            const body = await response.text()

            if (response.status === 200) await queued
            assert.equal(response.status, valid ? 200 : 500)
            if (valid) {
                assert.equal(body, BODY)
                assert.equal(await readFile(cached, 'utf8'), BODY)
            } else {
                assert.notEqual(body, BODY)
                assert.equal(built, false)
                await assert.rejects(readFile(cached), {code: 'ENOENT'})
            }
        })
    }
}

const BODY = 'fixture archive bytes'

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

const certificate = async name => {
    const key = Path.join(dir, `${name}.key`)
    const cert = Path.join(dir, `${name}.crt`)
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
        '-subj', `/CN=${name}`, '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert],
    {stdio: 'ignore', timeout: 10000})
    return {key: await readFile(key), cert: await readFile(cert)}
}
