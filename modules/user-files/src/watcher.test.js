import {access, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
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
    it('omits data from the home scan while listing other entries', async () => {
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
    })
})

const settle = () => new Promise(resolve => setTimeout(resolve, SETTLE_MS))
