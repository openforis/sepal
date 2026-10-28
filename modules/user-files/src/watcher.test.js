import assert from 'node:assert/strict'
import {existsSync, mkdtempSync} from 'node:fs'
import {mkdir, rm, writeFile} from 'node:fs/promises'
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

describe('removing a path', () => {
    let stop$

    before(() => configureNoLogging())

    beforeEach(() => {
        stop$ = new Subject()
    })

    afterEach(() => stop$.next())

    after(() => rm(homeDir, {recursive: true, force: true}))

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

const aFile = async (username, path) => {
    const file = join(homeDir, username, path)
    await mkdir(join(file, '..'), {recursive: true})
    await writeFile(file, '')
}
