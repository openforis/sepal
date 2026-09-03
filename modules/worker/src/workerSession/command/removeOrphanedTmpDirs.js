// Walks the sandbox home tree and deletes per-instance tmp directories that no longer belong to
// any live (PENDING/ACTIVE) session — leftovers from instances that were terminated.
//
// The walk (homeDir default '/data/home'):
//   homeDir/*                 (user dirs; directories only)          → userDir
//     userDir/tmp             (directory only)                       → tmpDir
//       tmpDir/*              (per-instance dirs; directories only)  → instanceDir
// The instance directory NAME is the instanceId; the user directory NAME is the username.
// An instanceDir is orphaned when NO session matches BOTH:
//   session.instance.id === instanceDir-name  AND  session.username === userDir-name
// Orphans are removed recursively.
//
// Filesystem side effect. homeDir is injected so tests run against a scratch dir — do NOT touch
// the real /data/home in tests.

import {promises as fs} from 'fs'
import path from 'path'

import {getLogger} from '#sepal/log'

import {State} from '../workerSession.js'

const log = getLogger('worker/removeOrphanedTmpDirs')

const DEFAULT_HOME_DIR = '/data/home'

// listDirs(dir) — names of subdirectories of dir; [] if dir is missing / not a directory.
const listDirs = async dir => {
    let entries
    try {
        entries = await fs.readdir(dir, {withFileTypes: true})
    } catch (_error) {
        return []
    }
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
}

const removeOrphanedTmpDirs = async ({repo, homeDir = DEFAULT_HOME_DIR}) => {
    const sessions = await repo.sessions([State.PENDING, State.ACTIVE])

    // noSessionForInstance — no live session owns this (username, instanceId) pair.
    const noSessionForInstance = (username, instanceId) =>
        !sessions.some(session =>
            session.instance.id === instanceId && session.username === username
        )

    const usernames = await listDirs(homeDir)
    for (const username of usernames) {
        const tmpDir = path.join(homeDir, username, 'tmp')
        const instanceIds = await listDirs(tmpDir)
        for (const instanceId of instanceIds) {
            if (noSessionForInstance(username, instanceId)) {
                const instanceDir = path.join(tmpDir, instanceId)
                await fs.rm(instanceDir, {recursive: true, force: true})
                log.debug(`Removed orphaned tmp dir ${instanceDir}`)
            }
        }
    }
    return null
}

export {removeOrphanedTmpDirs}
