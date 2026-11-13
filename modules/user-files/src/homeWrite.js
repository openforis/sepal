import {randomUUID} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {chmod, chown, link, lstat, mkdir, open, realpath, rename, stat, unlink} from 'node:fs/promises'
import Path from 'node:path'

import {getLogger} from '#sepal/log'

import {isWithin} from './homePath.js'

const log = getLogger('homeWrite')

// Where a write to a path in a user's home goes. Refused when a part of the path, or what is there already, is a link
// or not the user's, when a file would replace anything but a regular file, and when a parent folder is missing, unless
// the write creates a folder with its parents (recursive). Answers whether the target exists already, and when not, the
// first folder of the path to create.
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

// Publishes a copy of the source at the target only once complete: written, owned by the user, readable by all and
// synced. Until then the target is as it was, whatever fails. Overwriting renames the copy over what is there, so that
// readers see one version or the other, whole. Otherwise a link publishes the copy only while nothing is there,
// refusing whatever got there first, however late.
export const publishFile = async (source, target, owner, {overwrite}) => {
    const staged = await stage(source, Path.dirname(target), owner)
    await publish(staged, target, overwrite)
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

// A complete copy of the source in the directory, under a name of its own that no other operation uses: in the
// target's directory, a rename or link never crosses filesystems. Removed again if the copy fails.
const stage = async (source, directory, owner) => {
    const staged = Path.join(directory, `.upload-${randomUUID()}`)
    const handle = await open(staged, 'wx', 0o600)
    try {
        await copy(source, handle, owner)
    } catch (error) {
        await removeStaged(staged)
        throw error
    }
    return staged
}

// Ownership and permissions go through the handle, never through a path that might since lead elsewhere.
const copy = async (source, handle, {uid, gid}) => {
    try {
        await handle.writeFile(createReadStream(source))
        await handle.chown(uid, gid)
        await handle.chmod(0o644)
        await handle.sync()
    } finally {
        await handle.close()
    }
}

const publish = async (staged, target, overwrite) => {
    try {
        await (overwrite ? rename(staged, target) : link(staged, target))
    } catch (error) {
        await removeStaged(staged)
        throw error.code === 'EEXIST' && !overwrite ? conflict() : error
    }
    if (!overwrite) {
        await removeStaged(staged)
    }
}

// Never fails: a staged name left behind is logged, and whether the copy was published decides the answer.
const removeStaged = staged =>
    unlink(staged).catch(error => log.warn(`Cannot remove staged upload: ${staged} (${error.code})`))

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
    // A rename would replace a socket, FIFO or device without ever opening it, which writing to it would have tried.
    if (!directory && !stats.isFile()) {
        throw badRequest('Target exists and is not a regular file')
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

const conflict = () =>
    refusal(409, 'Cannot overwrite existing files')
