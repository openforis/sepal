import {mkdir, mkdtemp, readdir, readlink, rm, stat, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {DataFolder} from './dataFolder.js'

const roots = []

afterAll(() => Promise.all(roots.map(root => rm(root, {recursive: true, force: true}))))

describe('prepare', () => {
    it('creates an empty data folder and returns the owner of the home', async () => {
        const {folder, home} = await harness()

        const result = await folder.prepare('alice')

        const homeStat = await stat(home)
        expect(result).toEqual({uid: homeStat.uid, gid: homeStat.gid, movedTo: null})
        expect((await stat(join(home, 'data'))).isDirectory()).toBe(true)
    })

    it('keeps an empty data folder as it is', async () => {
        const {folder, home} = await harness()
        await mkdir(join(home, 'data'))

        expect((await folder.prepare('alice')).movedTo).toBeNull()
    })

    it('moves a non-empty data folder to data.local and tells the user', async () => {
        const {folder, home, notified} = await harness()
        await mkdir(join(home, 'data'))
        await writeFile(join(home, 'data', 'mine.txt'), 'x')

        const result = await folder.prepare('alice')

        expect(result.movedTo).toBe('data.local')
        expect(await readdir(join(home, 'data.local'))).toEqual(['mine.txt'])
        expect(await readdir(join(home, 'data'))).toEqual([])
        expect(notified).toEqual([expect.objectContaining({username: 'alice'})])
        expect(notified[0].content).toContain('data.local')
    })

    it('picks the next free name when data.local is taken', async () => {
        const {folder, home} = await harness()
        await mkdir(join(home, 'data.local'))
        await mkdir(join(home, 'data'))
        await writeFile(join(home, 'data', 'mine.txt'), 'x')

        expect((await folder.prepare('alice')).movedTo).toBe('data.local.1')
    })

    it('moves a file named data aside', async () => {
        const {folder, home} = await harness()
        await writeFile(join(home, 'data'), 'not a folder')

        expect((await folder.prepare('alice')).movedTo).toBe('data.local')
        expect((await stat(join(home, 'data'))).isDirectory()).toBe(true)
    })

    it('moves a symlink named data aside without following it', async () => {
        const {folder, home, root} = await harness()
        const target = join(root, 'elsewhere')
        await mkdir(target)
        await writeFile(join(target, 'keep.txt'), 'x')
        await symlink(target, join(home, 'data'))

        await folder.prepare('alice')

        expect(await readlink(join(home, 'data.local'))).toBe(target)
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
