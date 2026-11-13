import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {lstat, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {after, describe, test} from 'node:test'

import {removeUserPath} from './homePath.js'

// Assertions never follow links, so that these hold as well over a view that refuses to follow them (nosymfollow).

const root = mkdtempSync(join(tmpdir(), 'user-files-'))

after(() => rm(root, {recursive: true, force: true}))

describe('removeUserPath', () => {
    test('removes a folder inside the home', async () => {
        const alice = await aHome(await someHomes(), 'alice')
        await aFile(alice, 'project/file')

        await removeUserPath(alice, '/project')

        assert.equal(await exists(join(alice, 'project')), false)
    })

    test('refuses a path that leaves the home', async () => {
        const homes = await someHomes()
        const alice = await aHome(homes, 'alice')
        const bob = await aHome(homes, 'bob')

        await assert.rejects(removeUserPath(alice, '../bob'))

        assert.equal(await exists(join(bob, 'project')), true)
    })

    test('refuses the home itself', async () => {
        const alice = await aHome(await someHomes(), 'alice')

        for (const path of ['/', '', '.', 'project/..']) {
            await assert.rejects(removeUserPath(alice, path), `path: ${path}`)
        }

        assert.equal(await exists(alice), true)
    })

    test('removes a link without touching what it leads to', async () => {
        const homes = await someHomes()
        const alice = await aHome(homes, 'alice')
        const bob = await aHome(homes, 'bob')
        await symlink(bob, join(alice, 'link'))

        await removeUserPath(alice, '/link')

        assert.equal(await exists(join(alice, 'link')), false)
        assert.equal(await exists(join(bob, 'project')), true)
    })

    test('removes an entry beneath a linked directory where the link leads', async () => {
        const alice = await aHome(await someHomes(), 'alice')
        await aFile(alice, 'other/notes.txt')
        await aLink(alice, 'project/shortcut', '../other')

        await removeUserPath(alice, '/project/shortcut/notes.txt')

        assert.equal(await exists(join(alice, 'other', 'notes.txt')), false)
        assert.equal(await exists(join(alice, 'project', 'shortcut')), true)
    })

    test('removes a sandbox link without touching what it leads to', async () => {
        const alice = await aHome(await someHomes(), 'alice')
        await aFile(alice, 'other/notes.txt')
        await aLink(alice, 'project/shortcut', '/home/sepal-user/other')

        await removeUserPath(alice, '/project/shortcut')

        assert.equal(await exists(join(alice, 'project', 'shortcut')), false)
        assert.equal(await exists(join(alice, 'other', 'notes.txt')), true)
    })

    test('removes an entry beneath a sandbox-linked directory where the link leads', async () => {
        const alice = await aHome(await someHomes(), 'alice')
        await aFile(alice, 'other/notes.txt')
        await aLink(alice, 'project/shortcut', '/home/sepal-user/other')

        await removeUserPath(alice, '/project/shortcut/notes.txt')

        assert.equal(await exists(join(alice, 'other', 'notes.txt')), false)
        assert.equal(await exists(join(alice, 'project', 'shortcut')), true)
    })

    test('refuses to remove beneath a link leading out of the home', async () => {
        const homes = await someHomes()
        const alice = await aHome(homes, 'alice')
        const bob = await aHome(homes, 'bob')
        await aFile(bob, 'project/file')
        await aLink(alice, 'project/outside', '../../bob/project')

        await assert.rejects(removeUserPath(alice, '/project/outside/file'))

        assert.equal(await exists(join(bob, 'project', 'file')), true)
    })
})

// A folder of homes of its own for each test.
const someHomes = () =>
    mkdtemp(join(root, 'homes-'))

const aHome = async (homes, username) => {
    const home = join(homes, username)
    await mkdir(join(home, 'project'), {recursive: true})
    return home
}

const aFile = async (home, path, content = '') => {
    await mkdir(dirname(join(home, path)), {recursive: true})
    await writeFile(join(home, path), content)
}

const aLink = async (home, path, target) => {
    await mkdir(dirname(join(home, path)), {recursive: true})
    await symlink(target, join(home, path))
}

const exists = path =>
    lstat(path).then(() => true, () => false)
