import assert from 'node:assert/strict'
import {existsSync, mkdtempSync} from 'node:fs'
import {mkdir, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, mock, test} from 'node:test'

import {firstValueFrom, Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

const homeDir = mkdtempSync(join(tmpdir(), 'user-files-'))

mock.module('./config.js', {
    exports: {homeDir, pollIntervalMilliseconds: 1000}
})

const {filesDeleted$} = await import('./events.js')
const {createWatcher} = await import('./watcher.js')

let stop$
let sent$

before(() => configureNoLogging())

beforeEach(() => {
    stop$ = new Subject()
    sent$ = new Subject()
})

afterEach(() => stop$.next())

after(() => rm(homeDir, {recursive: true, force: true}))

describe('monitoring a path', () => {
    test('reports the files and directories it contains', async () => {
        await aFile('dave', 'project/data.csv', 'a,b')
        await mkdir(join(homeDir, 'dave', 'project', 'results'))
        const watcher = await createWatcher({send: sent, stop$})
        const scanned = firstSent()

        watcher.monitor({username: 'dave', clientId: 'client', subscriptionId: 'subscription', path: '/project'})

        const {data: {path, items}} = await scanned
        assert.equal(path, '/project')
        assert.deepEqual(Object.keys(items).sort(), ['data.csv', 'results'])
        assert.equal(items['data.csv'].file, true)
        assert.equal(items['data.csv'].size, 3)
        assert.equal(items.results.dir, true)
    })

    test('reports symlinks within the path and omits those leading outside it or nowhere', async () => {
        await aFile('erin', 'project/data.csv', 'a,b')
        await aFile('erin', 'other/secret')
        await symlink('data.csv', join(homeDir, 'erin', 'project', 'inside'))
        await symlink('../other', join(homeDir, 'erin', 'project', 'outside'))
        await symlink('missing', join(homeDir, 'erin', 'project', 'dangling'))
        const watcher = await createWatcher({send: sent, stop$})
        const scanned = firstSent()

        watcher.monitor({username: 'erin', clientId: 'client', subscriptionId: 'subscription', path: '/project'})

        const {data: {items}} = await scanned
        assert.deepEqual(Object.keys(items).sort(), ['data.csv', 'inside'])
        assert.equal(items.inside.size, 3)
    })
})

describe('removing a path', () => {
    test('announces the deletion for the user once the path is gone', async () => {
        await aFile('alice', 'project/file')
        const watcher = await createWatcher({send: () => null, stop$})
        const deleted = firstValueFrom(filesDeleted$)

        watcher.remove({username: 'alice', clientId: 'client', subscriptionId: 'subscription', path: '/project'})

        assert.deepEqual(await deleted, {username: 'alice'})
        assert.equal(existsSync(join(homeDir, 'alice', 'project')), false)
    })

    test('announces nothing when the path does not exist', async () => {
        await aFile('bob', 'project/file')
        await aFile('carol', 'project/file')
        const watcher = await createWatcher({send: () => null, stop$})
        const deleted = firstValueFrom(filesDeleted$)

        watcher.remove({username: 'bob', clientId: 'client', subscriptionId: 'subscription', path: '/missing'})
        watcher.remove({username: 'carol', clientId: 'client', subscriptionId: 'subscription', path: '/project'})

        assert.deepEqual(await deleted, {username: 'carol'})
    })
})

const aFile = async (username, path, content = '') => {
    const file = join(homeDir, username, path)
    await mkdir(join(file, '..'), {recursive: true})
    await writeFile(file, content)
}

const sent = message => sent$.next(message)

const firstSent = () => firstValueFrom(sent$)
