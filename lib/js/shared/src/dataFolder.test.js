import * as realFs from 'node:fs/promises'
import {mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {moveDataFolderAside} from './dataFolder.js'
import {configureNoLogging} from './log.js'

const homes = []

beforeAll(() => configureNoLogging())

afterAll(() => Promise.all(homes.map(home => rm(home, {recursive: true, force: true}))))

describe('moveDataFolderAside', () => {
    it('leaves a home without data alone', async () => {
        const {home, notified, move} = await harness()

        expect(await move()).toBeNull()

        expect(await readdir(home)).toEqual([])
        expect(notified).toEqual([])
    })

    it('leaves an empty data folder alone', async () => {
        const {home, notified, move} = await harness()
        await mkdir(join(home, 'data'))

        expect(await move()).toBeNull()

        expect(await readdir(home)).toEqual(['data'])
        expect(notified).toEqual([])
    })

    it('moves a non-empty data folder to data.local and tells the user', async () => {
        const {home, notified, move} = await harness()
        await mkdir(join(home, 'data'))
        await writeFile(join(home, 'data', 'mine.txt'), 'x')

        const movedTo = await move()

        expect(movedTo).toBe('data.local')
        expect(await readdir(home)).toEqual(['data.local'])
        expect(await readdir(join(home, 'data.local'))).toEqual(['mine.txt'])
        expect(notified).toEqual([expect.objectContaining({username: 'alice', subject: expect.any(String)})])
        expect(notified[0].content).toContain('~/data.local')
    })

    it('moves a file named data', async () => {
        const {home, move} = await harness()
        await writeFile(join(home, 'data'), 'not a folder')

        expect(await move()).toBe('data.local')

        expect(await readFile(join(home, 'data.local'), 'utf8')).toBe('not a folder')
    })

    it('moves a symlink named data without following it', async () => {
        const {home, move} = await harness()
        const target = join(home, 'elsewhere')
        await mkdir(target)
        await writeFile(join(target, 'keep.txt'), 'x')
        await symlink(target, join(home, 'data'))

        await move()

        expect(await readlink(join(home, 'data.local'))).toBe(target)
        expect(await readdir(target)).toEqual(['keep.txt'])
    })

    it('picks the first free name', async () => {
        const {home, move} = await harness()
        await mkdir(join(home, 'data.local'))
        await writeFile(join(home, 'data.local.1'), 'taken')
        await writeFile(join(home, 'data'), 'mine')

        expect(await move()).toBe('data.local.2')
    })

    it('moves nothing when another process moved data meanwhile', async () => {
        const {home, notified, move} = await harness()
        await writeFile(join(home, 'data'), 'mine')
        const racing = {
            ...realFs,
            rename: async (from, to) => {
                await realFs.rename(from, to)
                return realFs.rename(from, to)
            }
        }

        expect(await move({fs: racing})).toBeNull()

        expect(await readdir(home)).toEqual(['data.local'])
        expect(notified).toEqual([])
    })
})

async function harness() {
    const home = await mkdtemp(join(tmpdir(), 'data-folder-'))
    homes.push(home)
    const notified = []
    const move = ({fs} = {}) =>
        moveDataFolderAside({home, username: 'alice', notify: email => notified.push(email), ...(fs ? {fs} : {})})
    return {home, notified, move}
}
