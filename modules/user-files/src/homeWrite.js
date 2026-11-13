import {createReadStream, createWriteStream} from 'node:fs'
import {chmod, chown, lstat, mkdir, realpath, stat} from 'node:fs/promises'
import Path from 'node:path'
import {pipeline} from 'node:stream/promises'

import {isWithin} from './homePath.js'

// Where a write to a path in a user's home goes. Refused when a part of the path, or what is there already, is a link
// or not the user's, and when a parent folder is missing, unless the write creates a folder with its parents
// (recursive). Answers whether the target exists already, and when not, the first folder of the path to create.
export const resolveWritePath = async (homeDir, username, path, {directory = false, recursive = false} = {}) => {
    checkRequest(username, path)
    const userHomeDir = Path.join(homeDir, username)
    const owner = await ownerOf(userHomeDir)
    const home = await realpath(userHomeDir)
    const target = Path.join(home, path)
    if (target === home || !isWithin(home, target)) {
        throw forbidden('Path escapes base directory')
    }
    const missingParent = await firstMissing(pathsBelow(home, target).slice(0, -1), owner)
    if (missingParent) {
        checkMissingParent(missingParent, directory, recursive)
        return {home, target, owner, existed: false, firstMissing: missingParent}
    }
    return {home, target, owner, ...await targetState(target, owner, directory)}
}

// Creates each folder from the first missing one down to the target as the user's, checking any made meanwhile.
export const createFolders = async (firstMissing, target, owner) => {
    for (const folder of [firstMissing, ...pathsBelow(firstMissing, target)]) {
        await ensureFolder(folder, owner)
    }
}

export const writeFile = async (source, target, owner) => {
    await pipeline(createReadStream(source), createWriteStream(target, {flags: 'w'}))
    await giveTo(target, owner, 0o644)
}

const checkRequest = (username, path) => {
    if (!path || path === '.' || Path.isAbsolute(path)) {
        throw new Error('Path must be a non-empty relative path')
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        throw new Error('Invalid username')
    }
}

const ownerOf = async userHomeDir => {
    try {
        const {uid, gid} = await stat(userHomeDir)
        return {uid, gid}
    } catch (error) {
        throw new Error(`User directory not found: ${userHomeDir}`, {cause: error})
    }
}

// The first of these folders that does not exist, each one before it checked as a folder the user may write in.
const firstMissing = async ([folder, ...rest], owner) => {
    if (!folder) {
        return null
    }
    const stats = await lstatIfExists(folder)
    if (!stats) {
        return folder
    }
    checkFolder(folder, stats, owner)
    return firstMissing(rest, owner)
}

const checkMissingParent = (folder, directory, recursive) => {
    if (!directory) {
        throw forbidden(`Parent directory does not exist: ${folder}`)
    }
    if (!recursive) {
        throw forbidden(`Parent directory does not exist (enable recursive): ${folder}`)
    }
}

const targetState = async (target, owner, directory) => {
    const stats = await lstatIfExists(target)
    if (stats) {
        checkTarget(target, stats, owner, directory)
    }
    return {existed: !!stats, firstMissing: stats ? null : target}
}

const ensureFolder = async (folder, owner) => {
    const stats = await lstatIfExists(folder)
    if (stats) {
        checkFolder(folder, stats, owner)
    } else {
        await mkdir(folder)
        await giveTo(folder, owner, 0o755)
    }
}

const checkFolder = (folder, stats, owner) => {
    checkNotLink(folder, stats)
    if (!stats.isDirectory()) {
        throw forbidden(`Parent path component is not a directory: ${folder}`)
    }
    checkOwned(folder, stats, owner)
}

const checkTarget = (target, stats, owner, directory) => {
    checkNotLink(target, stats)
    checkOwned(target, stats, owner)
    if (stats.isDirectory() !== directory) {
        throw badRequest(directory ? 'Path exists but is not a directory' : 'Target exists and is a directory')
    }
}

const checkNotLink = (path, stats) => {
    if (stats.isSymbolicLink()) {
        throw forbidden(`${path} is a symlink`)
    }
}

const checkOwned = (path, stats, owner) => {
    if (stats.uid !== owner.uid) {
        throw forbidden(`Cannot operate inside directories you do not own: ${path}`)
    }
}

const lstatIfExists = path =>
    lstat(path).catch(error => {
        if (error.code === 'ENOENT') {
            return null
        }
        throw error
    })

// The paths from just below a folder down to a path within it.
const pathsBelow = (folder, path) =>
    Path.relative(folder, path).split(Path.sep).filter(Boolean)
        .map((_name, index, names) => Path.join(folder, ...names.slice(0, index + 1)))

const giveTo = async (path, {uid, gid}, mode) => {
    await chown(path, uid, gid)
    await chmod(path, mode)
}

// A write refused: answered with its status and reason, while the detail, naming server paths, stays in the log.
const refusal = (status, reason, detail = reason) =>
    Object.assign(new Error(detail), {status, reason})

const forbidden = detail =>
    refusal(403, 'Forbidden path', detail)

const badRequest = reason =>
    refusal(400, reason)
