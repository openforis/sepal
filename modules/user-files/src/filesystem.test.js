import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, test} from 'node:test'

import {createFolder, removeUserPath, setFile} from './filesystem.js'

let homes

beforeEach(async () => {
    homes = await mkdtemp(join(tmpdir(), 'user-files-'))
})

afterEach(() => rm(homes, {recursive: true, force: true}))

describe('removeUserPath', () => {
    test('removes a folder inside the home', async () => {
        const alice = await aHome('alice')
        await writeFile(join(alice, 'project', 'file'), '')

        await removeUserPath(alice, '/project')

        assert.equal(existsSync(join(alice, 'project')), false)
    })

    test('refuses a path that leaves the home', async () => {
        const alice = await aHome('alice')
        const bob = await aHome('bob')

        await assert.rejects(removeUserPath(alice, '../bob'))

        assert.equal(existsSync(join(bob, 'project')), true)
    })

    test('refuses the home itself', async () => {
        const alice = await aHome('alice')

        for (const path of ['/', '', '.', 'project/..']) {
            await assert.rejects(removeUserPath(alice, path), `path: ${path}`)
        }

        assert.equal(existsSync(alice), true)
    })

    test('removes a symlink without touching its target', async () => {
        const alice = await aHome('alice')
        const bob = await aHome('bob')
        await symlink(bob, join(alice, 'link'))

        await removeUserPath(alice, '/link')

        assert.equal(existsSync(join(alice, 'link')), false)
        assert.equal(existsSync(join(bob, 'project')), true)
    })
})

describe('createFolder', () => {
    test('creates folders inside the home', async () => {
        const alice = await aHome('alice')
        const ctx = aRequest('alice', {path: 'a/b', recursive: 'true'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 201)
        assert.equal(existsSync(join(alice, 'a', 'b')), true)
    })

    test('refuses a path that leaves the home', async () => {
        await aHome('alice')
        const ctx = aRequest('alice', {path: '../carol', recursive: 'true'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(homes, 'carol')), false)
    })
})

describe('setFile', () => {
    test('refuses a path that leaves the home', async () => {
        await aHome('alice')
        const bob = await aHome('bob')
        const upload = join(homes, 'upload')
        await writeFile(upload, 'content')
        const ctx = aRequest('alice', {path: '../bob/project/file'}, {file: {filepath: upload}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(bob, 'project', 'file')), false)
    })
})

const aHome = async username => {
    const home = join(homes, username)
    await mkdir(join(home, 'project'), {recursive: true})
    return home
}

const aRequest = (username, query, files) => ({
    request: {headers: {'sepal-user': JSON.stringify({username})}, files},
    query,
    response: {}
})
