import assert from 'node:assert/strict'
import * as childProcess from 'node:child_process'
import {once} from 'node:events'
import * as nodeFs from 'node:fs'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {text} from 'node:stream/consumers'
import {after, afterEach, beforeEach, describe, mock, test} from 'node:test'
import {fileURLToPath} from 'node:url'

import _ from 'lodash'

import {configureNoLogging} from '#sepal/log'

// Folders are created with the authority of the home's owner, never more: as root, homes here belong to an ordinary
// user, as deployed homes do. Faults reach whichever process creates the folders, this one or one of its own.

const asRoot = process.getuid() === 0
const USER = asRoot ? {uid: 10002, gid: 9999} : {uid: process.getuid(), gid: process.getgid()}
const ROOT = {uid: 0, gid: 0}
const CREATE_FOLDERS_AS_USER = fileURLToPath(new URL('./createFoldersAsUser.js', import.meta.url))
const OTHER_GROUP = 4321

const scratch = nodeFs.realpathSync(nodeFs.mkdtempSync(join(tmpdir(), 'user-files-')))
nodeFs.chmodSync(scratch, 0o755)
const homes = join(scratch, 'homes')
const faultsModule = join(scratch, 'faults.mjs')

// Faults armed for the next folder creation:
// - appear: just before folders are created, this path is made by `make`.
// - swap: right after `path` is created, `replacement` takes its place, as the home's owner could arrange.
// - failCreating: creating this path fails.
// - start: the process creating folders starts 'missing' its program, or 'unchanged', without the owner's identity.
const faults = {appear: null, swap: null, failCreating: null, start: null}
// The processes started to create folders.
const started = []

// Loaded into a process creating folders, as it starts.
nodeFs.writeFileSync(faultsModule, `
import fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'

const {swap, failCreating} = JSON.parse(process.env.FOLDER_FAULTS)
const mkdir = fs.promises.mkdir
fs.promises.mkdir = async (path, ...options) => {
    if (path === failCreating) {
        throw Object.assign(new Error('Simulated failure'), {code: 'EIO'})
    }
    const result = await mkdir(path, ...options)
    if (path === swap?.path) {
        fs.renameSync(path, path + '-discarded')
        fs.renameSync(swap.replacement, path)
    }
    return result
}
syncBuiltinESMExports()
`, {mode: 0o644})

const fakeChildProcess = {
    ..._.omit(childProcess, 'default'),
    spawn: (command, args, options) => {
        const child = spawnWithFaults(command, args, options)
        started.push(child)
        return child
    }
}

const spawnWithFaults = (command, args, options) => {
    const {appear, swap, failCreating, start} = takeFaults()
    appear?.make(appear.path)
    if (start === 'missing') {
        return childProcess.spawn(join(scratch, 'missing'), args, options)
    }
    if (start === 'unchanged') {
        return childProcess.spawn(command, args, _.omit(options, ['uid', 'gid']))
    }
    return swap || failCreating
        ? childProcess.spawn(command, ['--import', faultsModule, ...args], {
            ...options,
            env: {FOLDER_FAULTS: JSON.stringify({swap, failCreating})}
        })
        : childProcess.spawn(command, args, options)
}

mock.module('node:child_process', {
    exports: {...fakeChildProcess, default: fakeChildProcess}
})

mock.module('node:fs/promises', {
    exports: {
        ...fs,
        mkdir: async (path, options) => {
            if (faults.appear?.path === path) {
                takeFaults().appear.make(path)
            }
            if (faults.failCreating === path) {
                takeFaults()
                throw Object.assign(new Error('Simulated failure'), {code: 'EIO'})
            }
            const result = await fs.mkdir(path, options)
            if (faults.swap?.path === path) {
                await swapIn(takeFaults().swap)
            }
            return result
        }
    }
})

const {createFolder} = await import('./filesystem.js')

configureNoLogging()

beforeEach(() => fs.mkdir(homes, {mode: 0o755}))

afterEach(async () => {
    takeFaults()
    started.length = 0
    await fs.rm(homes, {recursive: true, force: true})
})

after(() => fs.rm(scratch, {recursive: true, force: true}))

describe('creating folders', () => {
    test('creates a folder, and missing parents when asked, as the home\'s owner with mode 0755, even in a setgid folder of another group', async () => {
        const project = join(await aHome(), 'project')
        await fs.chown(project, USER.uid, asRoot ? OTHER_GROUP : USER.gid)
        await fs.chmod(project, 0o2775)

        for (const [path, recursive] of [['project/new', 'false'], ['project/a/b', 'true']]) {
            const ctx = aRequest({path, recursive})

            await createFolder(homes, ctx)

            assert.equal(ctx.response.status, 201, path)
            assert.deepEqual(ctx.body, {message: 'Directory created successfully', path}, path)
        }
        for (const path of ['new', 'a', 'a/b']) {
            assert.deepEqual(await ownership(join(project, path)), {...USER, mode: 0o755}, path)
        }
    })

    test('leaves a directory swapped in for the one it creates as it was', {skip: !asRoot && 'needs root'}, async () => {
        const project = join(await aHome(), 'project')
        const guarded = await aGuardedFolder(join(project, 'guarded'))
        const before = await described(guarded)
        faults.swap = {path: join(project, 'requested'), replacement: guarded}
        const ctx = aRequest({path: 'project/requested'})

        await createFolder(homes, ctx)

        assert.equal(await exists(join(project, 'requested-discarded')), true)
        assert.deepEqual(await described(join(project, 'requested')), before)
        assert.equal(await fs.readFile(join(project, 'requested', 'sentinel.txt'), 'utf8'), 'sentinel')
        assert.equal(ctx.response.status, 403)
        assert.deepEqual(ctx.body, {error: 'Forbidden path'})
    })

    test('creates in a folder appearing meanwhile only when it is the owner\'s directory', async () => {
        const project = join(await aHome(), 'project')
        const variants = {
            own: [anOwnFolder, 201],
            link: [path => nodeFs.symlinkSync(scratch, path), 403],
            ...(asRoot ? {foreign: [path => nodeFs.mkdirSync(path), 403]} : {})
        }

        for (const [name, [make, status]] of Object.entries(variants)) {
            faults.appear = {path: join(project, name), make}
            const ctx = aRequest({path: `project/${name}/new`, recursive: 'true'})

            await createFolder(homes, ctx)

            assert.equal(ctx.response.status, status, name)
            assert.equal(await exists(join(project, name, 'new')), status === 201, name)
        }
        assert.equal(await exists(join(scratch, 'new')), false)
    })

    for (const recursive of [false, true]) {
        test(`conflicts with a final folder created meanwhile, preserving it${recursive ? ' with recursive parents' : ''}`, async () => {
            const home = await aHome()
            const path = recursive ? 'project/a/new' : 'project/new'
            const target = join(home, path)
            faults.appear = {path: target, make: path => {
                if (recursive) {
                    anOwnFolder(dirname(path))
                }
                anOwnFolder(path)
                nodeFs.chmodSync(path, 0o700)
                nodeFs.writeFileSync(join(path, 'sentinel.txt'), 'sentinel')
            }}
            const ctx = aRequest({path, recursive: String(recursive)})

            await createFolder(homes, ctx)

            assert.equal(ctx.response.status, 409)
            assert.deepEqual(ctx.body, {error: 'Directory already exists'})
            assert.deepEqual(await ownership(target), {...USER, mode: 0o700})
            assert.equal(await fs.readFile(join(target, 'sentinel.txt'), 'utf8'), 'sentinel')
        })
    }

    test('refuses a final link, file or foreign folder appearing meanwhile', async () => {
        const project = join(await aHome(), 'project')
        const variants = {
            link: path => nodeFs.symlinkSync(scratch, path),
            file: path => nodeFs.writeFileSync(path, 'sentinel'),
            ...(asRoot ? {foreign: path => nodeFs.mkdirSync(path)} : {})
        }

        for (const [name, make] of Object.entries(variants)) {
            faults.appear = {path: join(project, name), make}
            const ctx = aRequest({path: `project/${name}`})

            await createFolder(homes, ctx)

            assert.equal(ctx.response.status, 403, name)
            assert.deepEqual(ctx.body, {error: 'Forbidden path'}, name)
        }
        assert.equal(nodeFs.readlinkSync(join(project, 'link')), scratch)
        assert.equal(await fs.readFile(join(project, 'file'), 'utf8'), 'sentinel')
    })

    test('refuses to create folders in a home root owns, starting nothing', {skip: !asRoot && 'needs root'}, async () => {
        const project = join(await aHome(ROOT), 'project')
        const ctx = aRequest({path: 'project/new'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 500)
        assert.deepEqual(ctx.body, {error: 'Failed to create directory'})
        assert.equal(await exists(join(project, 'new')), false)
        assert.equal(started.length, 0)
    })

    test('refuses to create a folder where the owner may not, as the system decides', async () => {
        const project = join(await aHome(), 'project')
        await fs.chmod(project, 0o555)
        const ctx = aRequest({path: 'project/new'})

        await createFolder(homes, ctx)

        assert.equal(ctx.response.status, 403)
        assert.deepEqual(ctx.body, {error: 'Forbidden path'})
        assert.equal(await exists(join(project, 'new')), false)
    })

    // Descriptors are taken as the request settles, before anything else this process does can release them.
    test('answers a failure to start, to take the owner\'s identity or to create only once its process is done, leaving nothing made, running or open', async () => {
        const project = join(await aHome(), 'project')
        const before = descriptors()
        const failures = [
            {start: 'missing'},
            {failCreating: join(project, 'a')},
            ...(asRoot ? [{start: 'unchanged'}] : [])
        ]

        for (const failure of failures) {
            Object.assign(faults, failure)
            const ctx = aRequest({path: 'project/a/b', recursive: 'true'})

            await createFolder(homes, ctx)

            assert.deepEqual(descriptors(), before, JSON.stringify(failure))
            assert.equal(ctx.response.status, 500, JSON.stringify(failure))
            assert.deepEqual(ctx.body, {error: 'Failed to create directory'}, JSON.stringify(failure))
            assert.equal(await exists(join(project, 'a')), false, JSON.stringify(failure))
        }
        assert.deepEqual(await children(), [])
    })
})

describe('the program creating folders', () => {
    test('refuses to run as root, creating nothing', {skip: !asRoot && 'needs root'}, async () => {
        const project = join(await aHome(ROOT), 'project')
        const child = childProcess.spawn(
            process.execPath,
            [CREATE_FOLDERS_AS_USER, '0', '0', '0', join(project, 'new')],
            {...ROOT, env: {}, stdio: ['ignore', 'pipe', 'ignore']}
        )

        const [output, [code]] = await Promise.all([text(child.stdout), once(child, 'close')])

        assert.deepEqual({code, output}, {code: 1, output: 'EIDENTITY'})
        assert.equal(await exists(join(project, 'new')), false)
    })
})

const takeFaults = () => {
    const taken = {...faults}
    Object.assign(faults, {appear: null, swap: null, failCreating: null, start: null})
    return taken
}

// Done by this process for creation within it, as the owner would do it for creation in a process of the owner's.
const swapIn = async ({path, replacement}) => {
    await fs.rename(path, `${path}-discarded`)
    await fs.rename(replacement, path)
}

const aRequest = query => ({
    request: {headers: {'sepal-user': JSON.stringify({username: 'alice'})}},
    query,
    response: {}
})

// A home with a project folder, both its owner's and setgid with the owner's group, as deployed homes are.
const aHome = async (owner = USER) => {
    const home = join(homes, 'alice')
    await fs.mkdir(join(home, 'project'), {recursive: true})
    for (const path of [home, join(home, 'project')]) {
        await fs.chown(path, owner.uid, owner.gid)
        await fs.chmod(path, 0o2770)
    }
    return home
}

const anOwnFolder = path => {
    nodeFs.mkdirSync(path)
    nodeFs.chownSync(path, USER.uid, USER.gid)
}

// A folder of root's that its group may not read, with a sentinel file in it.
const aGuardedFolder = async path => {
    await fs.mkdir(path)
    await fs.chmod(path, 0o700)
    await fs.writeFile(join(path, 'sentinel.txt'), 'sentinel', {mode: 0o600})
    return path
}

const ownership = async path => {
    const {uid, gid, mode} = await fs.stat(path)
    return {uid, gid, mode: mode & 0o7777}
}

const described = async path => {
    const {ino, uid, gid, mode} = await fs.stat(path)
    return {ino, uid, gid, mode: mode & 0o7777}
}

const descriptors = () =>
    nodeFs.readdirSync('/proc/self/fd').sort()

// Processes this one started that have not been reaped.
const children = async () => {
    const pids = (await fs.readdir('/proc')).filter(name => /^\d+$/.test(name))
    const parents = await Promise.all(pids.map(pid =>
        fs.readFile(join('/proc', pid, 'stat'), 'utf8').then(stat => stat.slice(stat.lastIndexOf(') ') + 2).split(' ')[1], () => null)
    ))
    return pids.filter((_pid, index) => Number(parents[index]) === process.pid)
}

const exists = path =>
    fs.lstat(path).then(() => true, () => false)
