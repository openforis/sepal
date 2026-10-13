import * as realFs from 'node:fs/promises'
import {mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {configureNoLogging} from '#sepal/log'

import {DataFolder} from './dataFolder.js'

const roots = []

beforeAll(() => configureNoLogging())

afterAll(() => Promise.all(roots.map(root => rm(root, {recursive: true, force: true}))))

describe('prepare', () => {
    it('creates an empty data folder and returns the owner of the home', async () => {
        const {folder, home} = await harness()

        const result = await folder.prepare('alice')

        const homeStat = await stat(home)
        expect(result).toEqual({uid: homeStat.uid, gid: homeStat.gid, movedTo: null})
        expect((await stat(join(home, 'data'))).isDirectory()).toBe(true)
    })

    it('moves a non-empty data folder aside, tells the user and creates an empty one', async () => {
        const {folder, home, notified} = await harness()
        await mkdir(join(home, 'data'))
        await writeFile(join(home, 'data', 'mine.txt'), 'x')

        const result = await folder.prepare('alice')

        expect(result.movedTo).toBe('data.local')
        expect(await readdir(join(home, 'data.local'))).toEqual(['mine.txt'])
        expect(await readdir(join(home, 'data'))).toEqual([])
        expect(notified).toEqual([expect.objectContaining({username: 'alice'})])
    })

    it('moves a file named data aside', async () => {
        const {folder, home} = await harness()
        await writeFile(join(home, 'data'), 'not a folder')

        expect((await folder.prepare('alice')).movedTo).toBe('data.local')
        expect((await stat(join(home, 'data'))).isDirectory()).toBe(true)
    })

    it('refuses a data symlink planted just before the folder is created', async () => {
        const {home, root, notified} = await harness()
        const target = join(root, 'elsewhere')
        await mkdir(target)
        await writeFile(join(target, 'keep.txt'), 'x')
        const before = await stat(target)
        const racing = {
            ...realFs,
            mkdir: async (path, ...args) => {
                await symlink(target, path)
                return realFs.mkdir(path, ...args)
            }
        }
        const folder = new DataFolder({homeRoot: root, fs: racing, notify: email => notified.push(email)})

        await expect(folder.prepare('alice')).rejects.toThrow(join(home, 'data'))

        const after = await stat(target)
        expect([after.uid, after.gid]).toEqual([before.uid, before.gid])
        expect(await readdir(target)).toEqual(['keep.txt'])
    })

    it('fails for a user without a home', async () => {
        const {folder} = await harness()

        await expect(folder.prepare('nobody')).rejects.toThrow()
    })
})

async function harness() {
    const root = await mkdtemp(join(tmpdir(), 'data-folder-'))
    roots.push(root)
    const home = join(root, 'alice')
    await mkdir(home)
    const notified = []
    const folder = new DataFolder({homeRoot: root, notify: email => notified.push(email)})
    return {folder, home, root, notified}
}
