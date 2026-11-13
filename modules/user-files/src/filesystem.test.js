import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {chown, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {text} from 'node:stream/consumers'
import {afterEach, beforeEach, describe, test} from 'node:test'

import _ from 'lodash'

import {createFolder, download, listFiles, setFile} from './filesystem.js'

// Assertions never follow links, so that these hold as well over a view that refuses to follow them (nosymfollow).

const asRoot = process.getuid() === 0

let homes

beforeEach(async () => {
    homes = await mkdtemp(join(tmpdir(), 'user-files-'))
})

afterEach(() => rm(homes, {recursive: true, force: true}))

describe('listFiles', () => {
    test('describes files and directories as they are, without link properties', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'a,b')
        await mkdir(join(alice, 'project', 'results'))
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        assert.deepEqual(listed(ctx), {
            'data.csv': {path: 'project/data.csv', type: 'file', size: 3},
            results: {path: 'project/results', type: 'directory'}
        })
    })

    test('describes a link as what it leads to anywhere in the home, naming the target it stores', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'a,b')
        await aFile(alice, 'other/notes.txt')
        await aLink(alice, 'project/data-link', 'data.csv')
        await aLink(alice, 'project/other-link', '../other')
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        assert.deepEqual(listed(ctx), {
            'data.csv': {path: 'project/data.csv', type: 'file', size: 3},
            'data-link': {path: 'project/data-link', type: 'file', size: 3, symlinkTarget: 'data.csv'},
            'other-link': {path: 'project/other-link', type: 'directory', symlinkTarget: '../other'}
        })
    })

    test('describes an unusable link by its problem, as neither file nor directory', async () => {
        const alice = await aHome('alice')
        await aHome('bob')
        await aLink(alice, 'project/dangling', 'missing')
        await aLink(alice, 'project/loop', 'loop')
        await aLink(alice, 'project/outside', '../../bob/project')
        await aLink(alice, 'project/too-long', 'x'.repeat(256))
        await aFile(alice, 'project/data.csv')
        await aLink(alice, 'project/through-file', 'data.csv/..')
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        assert.deepEqual(listed(ctx), {
            dangling: {path: 'project/dangling', type: 'symlink', symlinkTarget: 'missing', symlinkProblem: 'missing-target'},
            loop: {path: 'project/loop', type: 'symlink', symlinkTarget: 'loop', symlinkProblem: 'link-loop'},
            outside: {path: 'project/outside', type: 'symlink', symlinkTarget: '../../bob/project', symlinkProblem: 'outside-home'},
            'too-long': {path: 'project/too-long', type: 'symlink', symlinkTarget: 'x'.repeat(256), symlinkProblem: 'inaccessible-target'},
            'data.csv': {path: 'project/data.csv', type: 'file', size: 0},
            'through-file': {path: 'project/through-file', type: 'symlink', symlinkTarget: 'data.csv/..', symlinkProblem: 'missing-target'}
        })
    })

    test('describes a link leading out of the home alike, whatever is there', async () => {
        const alice = await aHome('alice')
        const bob = await aHome('bob')
        await aFile(alice, 'project/own.txt', 'own')
        await aLink(alice, 'project/foreign', '../../bob/private/secret.txt')
        await aLink(alice, 'project/out-and-back', '../../bob/private/../../alice/project/own.txt')
        await aLink(alice, 'project/hop', '../../bob/private')
        await aLink(alice, 'project/confined', 'hop/secret.txt')
        const list = async () => {
            const ctx = aRequest('alice', {path: 'project'})
            await listFiles(homes, ctx)
            return _.omit(listed(ctx), 'own.txt')
        }

        await aFile(bob, 'private/secret.txt', 'secret')
        const whileAFile = await list()
        await rm(join(bob, 'private', 'secret.txt'))
        await mkdir(join(bob, 'private', 'secret.txt'))
        const whileAFolder = await list()
        await rm(join(bob, 'private'), {recursive: true})
        const whileMissing = await list()

        const outside = (name, symlinkTarget) =>
            ({path: `project/${name}`, type: 'symlink', symlinkTarget, symlinkProblem: 'outside-home'})
        for (const listing of [whileAFile, whileAFolder, whileMissing]) {
            assert.deepEqual(listing, {
                foreign: outside('foreign', '../../bob/private/secret.txt'),
                'out-and-back': outside('out-and-back', '../../bob/private/../../alice/project/own.txt'),
                hop: outside('hop', '../../bob/private'),
                confined: outside('confined', 'hop/secret.txt')
            })
        }
    })

    test('follows a link to an ancestor however often a path repeats it', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'a,b')
        await aLink(alice, 'project/up', '..')
        const ctx = aRequest('alice', {path: 'project/up/project/up/project'})

        await listFiles(homes, ctx)

        assert.equal(ctx.body.path, 'project/up/project/up/project')
        assert.deepEqual(listed(ctx), {
            'data.csv': {path: 'project/up/project/up/project/data.csv', type: 'file', size: 3},
            up: {path: 'project/up/project/up/project/up', type: 'directory', symlinkTarget: '..'}
        })
    })

    test('follows an absolute link only into the home it names, however it spells the home', async () => {
        const alice = await aHome('alice')
        const bob = await aHome('bob')
        await mkdir(join(alice, 'other'))
        const home = await realpath(alice)
        const targets = {
            inside: `${home}/other`,
            doubled: `${dirname(home)}//alice/other`,
            dotted: `${dirname(home)}/./alice/other`,
            outside: `${await realpath(bob)}/project`,
            leaving: `${home}/../alice/other`
        }
        await Promise.all(Object.entries(targets).map(([name, target]) => aLink(alice, `project/${name}`, target)))
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        const into = name => ({path: `project/${name}`, type: 'directory', symlinkTarget: targets[name]})
        const outOf = name => ({path: `project/${name}`, type: 'symlink', symlinkTarget: targets[name], symlinkProblem: 'outside-home'})
        assert.deepEqual(listed(ctx), {
            inside: into('inside'),
            doubled: into('doubled'),
            dotted: into('dotted'),
            outside: outOf('outside'),
            leaving: outOf('leaving')
        })
    })

    test('follows a link written in a sandbox into the home the sandbox shows there', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'a,b')
        await mkdir(join(alice, 'other'))
        const targets = {
            file: '/home/sepal-user/project/data.csv',
            folder: '/home/sepal-user/other',
            home: '/home/sepal-user',
            spelled: '/home//sepal-user/./other/'
        }
        await Promise.all(Object.entries(targets).map(([name, target]) => aLink(alice, `project/${name}`, target)))
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        assert.deepEqual(_.omit(listed(ctx), 'data.csv'), {
            file: {path: 'project/file', type: 'file', size: 3, symlinkTarget: targets.file},
            folder: {path: 'project/folder', type: 'directory', symlinkTarget: targets.folder},
            home: {path: 'project/home', type: 'directory', symlinkTarget: targets.home},
            spelled: {path: 'project/spelled', type: 'directory', symlinkTarget: targets.spelled}
        })
    })

    test('refuses a sandbox link leaving the home it names, or naming another', async () => {
        const alice = await aHome('alice')
        await aHome('bob')
        await mkdir(join(alice, 'other'))
        const targets = {
            leaving: '/home/sepal-user/../sepal-user/other',
            above: '/home/../home/sepal-user/other',
            crossing: '/home/sepal-user/other/../../bob',
            similar: '/home/sepal-user-other/other'
        }
        await Promise.all(Object.entries(targets).map(([name, target]) => aLink(alice, `project/${name}`, target)))
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        assert.deepEqual(listed(ctx), _.mapValues(targets, (symlinkTarget, name) =>
            ({path: `project/${name}`, type: 'symlink', symlinkTarget, symlinkProblem: 'outside-home'})
        ))
    })

    test('refuses a link into the storage a sandbox mounts in the home, whatever the home holds there', async () => {
        const alice = await aHome('alice')
        const targets = {
            shared: '/home/sepal-user/shared/data.csv',
            tmp: '/home/sepal-user//tmp',
            crossing: '/home/sepal-user/project/../shared',
            relative: '../shared/data.csv',
            nested: '../hall/shared'
        }
        await aLink(alice, 'hall', '.')
        await Promise.all(Object.entries(targets).map(([name, target]) => aLink(alice, `project/${name}`, target)))
        const list = async () => {
            const ctx = aRequest('alice', {path: 'project'})
            await listFiles(homes, ctx)
            return listed(ctx)
        }

        const withoutFolders = await list()
        await aFile(alice, 'shared/data.csv', 'a,b')
        await mkdir(join(alice, 'tmp'))
        const withFolders = await list()

        const unavailable = _.mapValues(targets, (symlinkTarget, name) =>
            ({path: `project/${name}`, type: 'symlink', symlinkTarget, symlinkProblem: 'outside-home'})
        )
        assert.deepEqual(withoutFolders, unavailable)
        assert.deepEqual(withFolders, unavailable)
    })

    test('lists the home\'s own folders named like sandbox mounts, also by way of a link', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'shared/data.csv', 'a,b')
        await aLink(alice, 'project/up', '..')
        const ctx = aRequest('alice', {path: 'project/up/shared'})

        await listFiles(homes, ctx)

        assert.deepEqual(listed(ctx), {'data.csv': {path: 'project/up/shared/data.csv', type: 'file', size: 3}})
    })

    test('lists a sandbox-linked directory under the path it was asked for', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'other/notes.txt')
        await aLink(alice, 'project/shortcut', '/home/sepal-user/other')
        const ctx = aRequest('alice', {path: 'project/shortcut'})

        await listFiles(homes, ctx)

        assert.equal(ctx.body.path, 'project/shortcut')
        assert.deepEqual(listed(ctx), {'notes.txt': {path: 'project/shortcut/notes.txt', type: 'file', size: 0}})
    })

    test('treats a name starting with two dots as within the home', async () => {
        const alice = await aHome('alice')
        await mkdir(join(alice, '..notes'))
        await aLink(alice, 'project/notes', '../..notes')
        const ctx = aRequest('alice', {path: 'project'})

        await listFiles(homes, ctx)

        assert.deepEqual(listed(ctx).notes, {path: 'project/notes', type: 'directory', symlinkTarget: '../..notes'})
    })

    test('lists a linked directory under the path it was asked for', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'other/notes.txt')
        await aLink(alice, 'project/shortcut', '../other')
        const ctx = aRequest('alice', {path: 'project/shortcut'})

        await listFiles(homes, ctx)

        assert.equal(ctx.body.path, 'project/shortcut')
        assert.deepEqual(listed(ctx), {'notes.txt': {path: 'project/shortcut/notes.txt', type: 'file', size: 0}})
    })

    test('refuses to list a directory through a link leading out of the home by way of another', async () => {
        const alice = await aHome('alice')
        await aHome('bob')
        await aLink(alice, 'project/hop', '../../bob')
        await aLink(alice, 'project/outside', 'hop/project')
        const ctx = aRequest('alice', {path: 'project/outside'})

        await listFiles(homes, ctx)

        assert.equal(ctx.response.status, 404)
        assert.equal(ctx.body, undefined)
    })
})

describe('download', () => {
    test('downloads the file a link leads to, named as the link', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'other/2024-final.csv', 'a,b')
        await aLink(alice, 'project/report.csv', '../other/2024-final.csv')
        const ctx = aRequest('alice', {path: 'project/report.csv'})

        await download(homes, ctx)

        assert.equal(await text(ctx.body), 'a,b')
        assert.equal(ctx.attachmentName, 'report.csv')
    })

    test('downloads the file a sandbox link leads to in the home', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'other/2024-final.csv', 'a,b')
        await aLink(alice, 'project/report.csv', '/home/sepal-user/other/2024-final.csv')
        const ctx = aRequest('alice', {path: 'project/report.csv'})

        await download(homes, ctx)

        assert.equal(await text(ctx.body), 'a,b')
        assert.equal(ctx.attachmentName, 'report.csv')
    })

    test('refuses to download through a link leaving the home, even one that comes back to it', async () => {
        const alice = await aHome('alice')
        await aHome('bob')
        await aFile(alice, 'project/data.csv', 'a,b')
        await aLink(alice, 'project/report.csv', '../../bob/project/../../alice/project/data.csv')
        const ctx = aRequest('alice', {path: 'project/report.csv'})

        await download(homes, ctx)

        assert.equal(ctx.response.status, 404)
        assert.equal(ctx.body, undefined)
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

    test('creates a folder in an existing one', async () => {
        const alice = await aHome('alice')
        const ctx = aRequest('alice', {path: 'project/new'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 201)
        assert.equal(existsSync(join(alice, 'project', 'new')), true)
    })

    test('refuses to create missing parent folders unless asked to', async () => {
        const alice = await aHome('alice')
        const ctx = aRequest('alice', {path: 'a/b'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(alice, 'a')), false)
    })

    test('refuses a folder that already exists', async () => {
        await aHome('alice')
        const ctx = aRequest('alice', {path: 'project'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 409)
    })

    test('refuses a folder where a file is', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv')
        const ctx = aRequest('alice', {path: 'project/data.csv', recursive: 'true'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 400)
    })

    test('refuses a path that leaves the home', async () => {
        await aHome('alice')
        const ctx = aRequest('alice', {path: '../carol', recursive: 'true'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(homes, 'carol')), false)
    })

    test('refuses to create a folder through a linked directory', async () => {
        const alice = await aHome('alice')
        await mkdir(join(alice, 'other'))
        await aLink(alice, 'project/shortcut', '../other')
        const ctx = aRequest('alice', {path: 'project/shortcut/new', recursive: 'true'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(await exists(join(alice, 'other', 'new')), false)
    })

    test('refuses to create a folder through a sandbox-linked directory', async () => {
        const alice = await aHome('alice')
        await mkdir(join(alice, 'other'))
        await aLink(alice, 'project/shortcut', '/home/sepal-user/other')
        const ctx = aRequest('alice', {path: 'project/shortcut/new', recursive: 'true'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(await exists(join(alice, 'other', 'new')), false)
    })

    test('answers a failure it did not expect without its details', async () => {
        await aHome('alice')
        const ctx = aRequest('alice', {path: 'x'.repeat(256)})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 500)
        assert.deepEqual(ctx.body, {error: 'Failed to create directory'})
    })

    test('refuses to create a folder inside one the user does not own', {skip: !asRoot && 'changing owners needs root'}, async () => {
        const alice = await aHome('alice')
        await chown(join(alice, 'project'), 4242, 4242)
        const ctx = aRequest('alice', {path: 'project/new'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(alice, 'project', 'new')), false)
    })
})

describe('setFile', () => {
    test('writes a new file', async () => {
        const alice = await aHome('alice')
        const ctx = aRequest('alice', {path: 'project/data.csv'}, {file: {filepath: await anUpload('a,b')}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 200)
        assert.equal(ctx.body.overwritten, false)
        assert.equal(await readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'a,b')
    })

    test('refuses to replace a file unless asked to overwrite it', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'a,b')
        const ctx = aRequest('alice', {path: 'project/data.csv'}, {file: {filepath: await anUpload('c,d')}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 409)
        assert.equal(await readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'a,b')
    })

    test('replaces a file when asked to overwrite it', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'project/data.csv', 'a,b')
        const ctx = aRequest('alice', {path: 'project/data.csv', overwrite: 'true'}, {file: {filepath: await anUpload('c,d')}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 200)
        assert.equal(ctx.body.overwritten, true)
        assert.equal(await readFile(join(alice, 'project', 'data.csv'), 'utf8'), 'c,d')
    })

    test('refuses a path where a folder is', async () => {
        await aHome('alice')
        const ctx = aRequest('alice', {path: 'project', overwrite: 'true'}, {file: {filepath: await anUpload()}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 400)
    })

    test('refuses a file in a folder that does not exist', async () => {
        const alice = await aHome('alice')
        const ctx = aRequest('alice', {path: 'missing/data.csv'}, {file: {filepath: await anUpload()}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(alice, 'missing')), false)
    })

    test('refuses a path that leaves the home', async () => {
        await aHome('alice')
        const bob = await aHome('bob')
        const ctx = aRequest('alice', {path: '../bob/project/file'}, {file: {filepath: await anUpload()}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(existsSync(join(bob, 'project', 'file')), false)
    })

    test('refuses to overwrite a file through a sandbox link', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'other/data.csv', 'a,b')
        await aLink(alice, 'project/data.csv', '/home/sepal-user/other/data.csv')
        const ctx = aRequest('alice', {path: 'project/data.csv', overwrite: 'true'}, {file: {filepath: await anUpload()}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(await readFile(join(alice, 'other', 'data.csv'), 'utf8'), 'a,b')
    })

    test('refuses to overwrite a file through a link', async () => {
        const alice = await aHome('alice')
        await aFile(alice, 'other/data.csv', 'a,b')
        await aLink(alice, 'project/data.csv', '../other/data.csv')
        const ctx = aRequest('alice', {path: 'project/data.csv', overwrite: 'true'}, {file: {filepath: await anUpload()}})

        await setFile(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.equal(await readFile(join(alice, 'other', 'data.csv'), 'utf8'), 'a,b')
    })
})

const aHome = async username => {
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

const anUpload = async (content = 'content') => {
    const upload = join(homes, 'upload')
    await writeFile(upload, content)
    return upload
}

const aRequest = (username, query, files) => ({
    request: {headers: {'sepal-user': JSON.stringify({username})}, files},
    query,
    response: {},
    attachment(name) {
        this.attachmentName = name
    }
})

// What a listing says of each entry, by name: its path, type and link properties, and the size of a file.
const listed = ctx => Object.fromEntries(ctx.body.files.map(({name, path, type, size, symlinkTarget, symlinkProblem}) =>
    [name, _.omitBy({path, type, size: type === 'file' ? size : undefined, symlinkTarget, symlinkProblem}, _.isUndefined)]
))

const exists = path =>
    lstat(path).then(() => true, () => false)
