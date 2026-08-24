// Tests for RemoveOrphanedTmpDirs — runs against a scratch temp dir (NOT the real /data/home).
// Deletes only per-instance tmp dirs with no matching PENDING/ACTIVE session; keeps the rest.

import {jest} from '@jest/globals'
import {promises as fs} from 'fs'
import os from 'os'
import path from 'path'

import {removeOrphanedTmpDirs} from './command/removeOrphanedTmpDirs.js'
import {State} from './workerSession.js'

// Build a home tree: <home>/<user>/tmp/<instanceId>/marker
const makeInstanceDir = async (home, user, instanceId) => {
    const dir = path.join(home, user, 'tmp', instanceId)
    await fs.mkdir(dir, {recursive: true})
    await fs.writeFile(path.join(dir, 'marker'), 'x')
    return dir
}

const exists = async p => {
    try {
        await fs.access(p)
        return true
    } catch (_e) {
        return false
    }
}

describe('removeOrphanedTmpDirs', () => {
    let home

    beforeEach(async () => {
        home = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-tmp-'))
    })

    afterEach(async () => {
        await fs.rm(home, {recursive: true, force: true})
    })

    test('deletes orphan instance dirs and keeps ones with a matching session (id + username)', async () => {
        const liveDir = await makeInstanceDir(home, 'alice', 'i-live')       // matching session → keep
        const orphanDir = await makeInstanceDir(home, 'alice', 'i-orphan')   // no session → delete
        // Same instanceId but different user → NOT a match → delete.
        const wrongUserDir = await makeInstanceDir(home, 'bob', 'i-live')

        const repo = {
            sessions: jest.fn().mockResolvedValue([
                {username: 'alice', instance: {id: 'i-live'}},
            ]),
        }

        await removeOrphanedTmpDirs({repo, homeDir: home})

        expect(repo.sessions).toHaveBeenCalledWith([State.PENDING, State.ACTIVE])
        expect(await exists(liveDir)).toBe(true)
        expect(await exists(orphanDir)).toBe(false)
        expect(await exists(wrongUserDir)).toBe(false)
    })

    test('no sessions → all instance dirs are orphans and removed', async () => {
        const a = await makeInstanceDir(home, 'alice', 'i-1')
        const b = await makeInstanceDir(home, 'bob', 'i-2')
        const repo = {sessions: jest.fn().mockResolvedValue([])}

        await removeOrphanedTmpDirs({repo, homeDir: home})

        expect(await exists(a)).toBe(false)
        expect(await exists(b)).toBe(false)
        // The user/tmp parent dirs are left in place (only the per-instance dirs are removed).
        expect(await exists(path.join(home, 'alice', 'tmp'))).toBe(true)
    })

    test('tolerates a user dir with no tmp subdir', async () => {
        await fs.mkdir(path.join(home, 'alice'), {recursive: true})
        const repo = {sessions: jest.fn().mockResolvedValue([])}
        await expect(removeOrphanedTmpDirs({repo, homeDir: home})).resolves.toBeNull()
    })
})
