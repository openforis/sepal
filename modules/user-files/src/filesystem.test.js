import {mkdir, mkdtemp, rm} from 'fs/promises'
import {tmpdir} from 'os'
import Path from 'path'

import {resolvePathForRemove} from './filesystem.js'

let root

beforeEach(async () => {
    root = await mkdtemp(Path.join(tmpdir(), 'user-files-'))
})

afterEach(async () => {
    await rm(root, {recursive: true, force: true})
})

test('refuses to remove a path outside the home directory', async () => {
    const home = Path.join(root, 'alice')
    await mkdir(home)
    await mkdir(Path.join(root, 'x'))

    await expect(resolvePathForRemove(home, '../x')).rejects.toThrow('Path outside base directory')
})
