import {access, chmod, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import Path from 'node:path'

import {Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

const CLIENT = {username: 'alice', clientId: 'c', subscriptionId: 's'}
const SETTLE_MS = 300

let homeDir
let sent
let stop$
let watcher

beforeAll(async () => {
    configureNoLogging()
    homeDir = await mkdtemp(Path.join(tmpdir(), 'user-files-watcher-'))
    process.env.HOME_DIR = homeDir
    process.env.POLL_INTERVAL_MS = '20'
    process.env.RABBITMQ_HOST = 'rabbitmq'
})

afterAll(() => rm(homeDir, {recursive: true, force: true}))

beforeEach(async () => {
    sent = []
    stop$ = new Subject()
    await rm(Path.join(homeDir, 'alice'), {recursive: true, force: true})
    await mkdir(Path.join(homeDir, 'alice', 'docs'), {recursive: true})
    await mkdir(Path.join(homeDir, 'alice', 'data', 'x'), {recursive: true})
    await writeFile(Path.join(homeDir, 'alice', 'data', 'x', 'f.txt'), 'f')
    const {createWatcher} = await import('./watcher.js')
    watcher = await createWatcher({send: message => sent.push(message), stop$})
})

afterEach(() => stop$.next())

describe('monitor', () => {
    it('moves a non-empty data folder to data.local before scanning the home', async () => {
        watcher.monitor({...CLIENT, path: '/'})

        await settle()

        expect(Object.keys(sent[0].data.items).sort()).toEqual(['data.local', 'docs'])
        await expect(access(Path.join(homeDir, 'alice', 'data.local', 'x', 'f.txt'))).resolves.toBeUndefined()
    })

    it('omits an empty data folder from the home scan', async () => {
        await rm(Path.join(homeDir, 'alice', 'data'), {recursive: true})
        await mkdir(Path.join(homeDir, 'alice', 'data'))

        watcher.monitor({...CLIENT, path: '/'})

        await settle()

        expect(Object.keys(sent[0].data.items)).toEqual(['docs'])
    })

    it('scans an ordinary directory', async () => {
        watcher.monitor({...CLIENT, path: 'docs'})

        await settle()

        expect(sent[0].data.path).toBe('docs')
    })

    it.each(['data', 'data/x', '/data/x'])('sends nothing when monitoring %s', async path => {
        watcher.monitor({...CLIENT, path})

        await settle()

        expect(sent).toEqual([])
    })
})

describe('remove', () => {
    it('leaves data on disk', async () => {
        watcher.remove({...CLIENT, path: 'data'})

        await settle()

        await expect(access(Path.join(homeDir, 'alice', 'data', 'x', 'f.txt'))).resolves.toBeUndefined()
    })

    it('removes an ordinary directory', async () => {
        watcher.remove({...CLIENT, path: 'docs'})

        await settle()

        await expect(access(Path.join(homeDir, 'alice', 'docs'))).rejects.toThrow()
        expect(removeFailures()).toEqual([])
    })

    it('reports data as failed', async () => {
        watcher.remove({...CLIENT, path: 'data'})

        await settle()

        expect(removeFailures()).toEqual([['data']])
    })

    it('reports a path that cannot be removed', async () => {
        const locked = Path.join(homeDir, 'alice', 'docs')
        await writeFile(Path.join(locked, 'f.txt'), 'f')
        await chmod(locked, 0o555)

        try {
            watcher.remove({...CLIENT, path: ['docs/f.txt']})
            await settle()
        } finally {
            await chmod(locked, 0o755)
        }

        expect(removeFailures()).toEqual([['docs/f.txt']])
    })
})

const removeFailures = () => sent.filter(({data}) => data.removeFailed).map(({data}) => data.removeFailed)

const settle = () => new Promise(resolve => setTimeout(resolve, SETTLE_MS))
