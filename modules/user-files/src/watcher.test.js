import assert from 'node:assert/strict'
import {existsSync, mkdtempSync} from 'node:fs'
import {mkdir, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, mock, test} from 'node:test'

import _ from 'lodash'
import {filter, firstValueFrom, skip, Subject, timeout} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

const POLL_INTERVAL_MS = 20
const SCAN_TIMEOUT_MS = 5000

const homeDir = mkdtempSync(join(tmpdir(), 'user-files-'))

mock.module('./config.js', {
    exports: {homeDir, pollIntervalMilliseconds: POLL_INTERVAL_MS}
})

const {filesDeleted$} = await import('./events.js')
const {createWatcher} = await import('./watcher.js')
const {listFiles} = await import('./filesystem.js')

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
        assert.deepEqual(described(items), {
            'data.csv': {file: true, size: 3},
            results: {dir: true}
        })
    })

    test('reports a link as what it leads to within the home, and an unusable one by its problem', async () => {
        await aFile('erin', 'project/data.csv', 'a,b')
        await aFile('erin', 'other/notes.txt')
        await aFile('frank', 'project/secret')
        await aLink('erin', 'project/inside', 'data.csv')
        await aLink('erin', 'project/elsewhere', '../other')
        await aLink('erin', 'project/outside', '../../frank/project')
        await aLink('erin', 'project/dangling', 'missing')
        const watcher = await createWatcher({send: sent, stop$})
        const scanned = firstSent()

        watcher.monitor({username: 'erin', clientId: 'client', subscriptionId: 'subscription', path: '/project'})

        const {data: {items}} = await scanned
        assert.deepEqual(described(items), {
            'data.csv': {file: true, size: 3},
            inside: {file: true, size: 3, symlinkTarget: 'data.csv'},
            elsewhere: {dir: true, symlinkTarget: '../other'},
            outside: {symlinkTarget: '../../frank/project', symlinkProblem: 'outside-home'},
            dangling: {symlinkTarget: 'missing', symlinkProblem: 'missing-target'}
        })
    })

    test('reports each entry as a listing of the directory describes it', async () => {
        await aFile('kate', 'project/data.csv', 'a,b')
        await aFile('kate', 'other/notes.txt')
        await aFile('liam', 'private/secret.txt')
        await aLink('kate', 'project/inside', 'data.csv')
        await aLink('kate', 'project/elsewhere', '../other')
        await aLink('kate', 'project/dangling', 'missing')
        await aLink('kate', 'project/out-and-back', '../../liam/private/../../kate/project/data.csv')
        const watcher = await createWatcher({send: sent, stop$})
        const scanned = firstSent()
        const listing = aListingRequest('kate', 'project')

        watcher.monitor({username: 'kate', clientId: 'client', subscriptionId: 'subscription', path: '/project'})
        await listFiles(homeDir, listing)

        const {data: {items}} = await scanned
        assert.equal(items['out-and-back'].symlinkProblem, 'outside-home')
        assert.deepEqual(_.mapValues(items, asListed), Object.fromEntries(listing.body.files.map(({name, type, size, symlinkTarget, symlinkProblem}) =>
            [name, _.omitBy({type, size: type === 'file' ? size : undefined, symlinkTarget, symlinkProblem}, _.isUndefined)]
        )))
    })

    test('reports a linked directory under the path monitored', async () => {
        await aFile('gina', 'other/notes.txt')
        await aLink('gina', 'project/shortcut', '../other')
        const watcher = await createWatcher({send: sent, stop$})
        const scanned = firstSent()

        watcher.monitor({username: 'gina', clientId: 'client', subscriptionId: 'subscription', path: '/project/shortcut'})

        const {data: {path, items}} = await scanned
        assert.equal(path, '/project/shortcut')
        assert.deepEqual(described(items), {'notes.txt': {file: true, size: 0}})
    })

    test('reports a broken link again once its target appears, without its problem', async () => {
        await aLink('hank', 'project/latest', 'report.csv')
        const watcher = await createWatcher({send: sent, stop$})
        const broken = firstSent()
        const recovered = firstSent(skip(1))
        watcher.monitor({username: 'hank', clientId: 'client', subscriptionId: 'subscription', path: '/project'})
        assert.equal((await broken).data.items.latest.symlinkProblem, 'missing-target')

        await aFile('hank', 'project/report.csv', 'a,b')

        const {data: {items}} = await recovered
        assert.deepEqual(described(items).latest, {file: true, size: 3, symlinkTarget: 'report.csv'})
    })

    test('keeps a failure in one monitored path to that path when a later unmonitor arrives', async () => {
        await aFile('kim', 'project/data.csv')
        await aFile('lou', 'project/data.csv')
        const watcher = await createWatcher({send: sent, stop$})
        const kim = {username: 'kim', clientId: 'kim-client', subscriptionId: 'subscription'}
        const lou = {username: 'lou', clientId: 'lou-client', subscriptionId: 'subscription'}
        const kimScanned = firstSent(filter(({clientId}) => clientId === kim.clientId))
        watcher.monitor({...kim, path: 123})
        watcher.monitor({...kim, path: '/project'})
        await kimScanned

        watcher.unmonitor({...kim, path: '/elsewhere'})

        const louScanned = firstSent(filter(({clientId}) => clientId === lou.clientId))
        watcher.monitor({...lou, path: '/project'})
        await louScanned
        const kimUpdated = firstSent(filter(({clientId, data}) => clientId === kim.clientId && data.items?.['later.csv']))
        await aFile('kim', 'project/later.csv')
        await kimUpdated
    })

    test('reports a path it cannot scan to the subscription monitoring it', async () => {
        await aFile('mona', 'project/data.csv', 'a,b')
        const watcher = await createWatcher({send: sent, stop$})
        const reported = firstSent()

        watcher.monitor({username: 'mona', clientId: 'client-m', subscriptionId: 'subscription-m', path: '/project/data.csv'})

        assert.deepEqual(await reported, {
            clientId: 'client-m',
            subscriptionId: 'subscription-m',
            data: {path: '/project/data.csv', error: 'ENOTDIR'}
        })
    })

    test('never lists the directory a link leads to outside the home', async () => {
        await aFile('ivan', 'project/data.csv')
        await aFile('judy', 'project/secret')
        await aLink('ivan', 'project/outside', '../../judy/project')
        const watcher = await createWatcher({send: sent, stop$})
        const sentPaths = []
        sent$.subscribe(({data}) => sentPaths.push(data.path))
        const scanned = firstSent(filter(({data}) => data.path === '/project'))

        watcher.monitor({username: 'ivan', clientId: 'client', subscriptionId: 'subscription', path: ['/project/outside', '/project']})

        await scanned
        await polls(5)
        assert.deepEqual(sentPaths, ['/project'])
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
    await mkdir(dirname(file), {recursive: true})
    await writeFile(file, content)
}

const aLink = async (username, path, target) => {
    const link = join(homeDir, username, path)
    await mkdir(dirname(link), {recursive: true})
    await symlink(target, link)
}

const aListingRequest = (username, path) => ({
    request: {headers: {'sepal-user': JSON.stringify({username})}},
    query: {path},
    response: {}
})

// A scanned entry as a listing types it: a file or directory, or else unusable.
const asListed = ({dir, file, size, symlinkTarget, symlinkProblem}) =>
    _.omitBy({type: dir ? 'directory' : (file ? 'file' : 'symlink'), size, symlinkTarget, symlinkProblem}, _.isUndefined)

const sent = message => sent$.next(message)

// The first message sent, after any operators given; one that never comes fails the test rather than leaving the run
// waiting, with the watcher still running.
const firstSent = (...operators) =>
    firstValueFrom(sent$.pipe(...operators, timeout(SCAN_TIMEOUT_MS)))

// What a scan reports of each entry, by name, apart from when it was modified.
const described = items =>
    _.mapValues(items, item => _.omit(item, 'mtime'))

const polls = count =>
    new Promise(resolve => setTimeout(resolve, count * POLL_INTERVAL_MS))
