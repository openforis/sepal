import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {link, lstat, open, realpath, rename, stat, unlink} from 'node:fs/promises'
import Path from 'node:path'
import {text} from 'node:stream/consumers'
import {fileURLToPath} from 'node:url'

import {getLogger} from '#sepal/log'

import {isWithin} from './homePath.js'

const log = getLogger('homeWrite')

const CREATE_FOLDERS_AS_USER = fileURLToPath(new URL('./createFoldersAsUser.js', import.meta.url))
const CREATE_FOLDERS_TIMEOUT_MS = 60000
// What createFoldersAsUser prints when the user may not create a folder there.
const FOLDER_REFUSALS = ['EACCES', 'EPERM', 'ELOOP', 'ENOTDIR', 'EREFUSED']

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

// Creates each folder from the first missing one down to the target, checking any made meanwhile, in a process of
// its own running as the home's owner: the folders are the user's from the start, and nothing in them is ever changed
// with more authority than the user's.
export const createFolders = async (firstMissing, target, owner) => {
    const folders = [firstMissing, ...pathsBelow(firstMissing, target)]
    const {code, signal, stdout, stderr} = await runAsOwner(owner, [CREATE_FOLDERS_AS_USER, ...identity(owner), ...folders])
    if (code !== 0) {
        if (stdout === 'EEXIST') {
            throw refusal(409, 'Directory already exists', `Directory already exists: ${target}`)
        }
        throw FOLDER_REFUSALS.includes(stdout)
            ? forbidden(`Cannot create folders as their owner (${stdout}): ${target}`)
            : new Error(`Creating folders as their owner failed (${stdout || signal || code}): ${target} ${stderr}`)
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

// Starts the program with the owner's uid and gid, which leaves it no other groups when this process can drop them,
// and with nothing else of this process: no environment, no descriptors but its output. A home root owns is refused:
// the program would have root's authority. Answers once the program has ended and its output is closed, killed should
// it take too long; a start that fails, taking the owner's identity included, is an error, raised only then too.
const runAsOwner = async ({uid, gid}, args) => {
    if (uid === 0) {
        throw new Error('Refusing to create folders as root, which owns the home')
    }
    const child = spawn(process.execPath, args, {
        uid,
        gid,
        env: {},
        cwd: '/',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: CREATE_FOLDERS_TIMEOUT_MS,
        killSignal: 'SIGKILL'
    })
    const failure = {}
    child.once('error', error => Object.assign(failure, {error}))
    const [stdout, stderr] = [child.stdout, child.stderr].map(stream => text(stream).catch(() => ''))
    const [code, signal] = await new Promise(resolve => child.once('close', (...ended) => resolve(ended)))
    const output = {code, signal, stdout: await stdout, stderr: await stderr}
    if (failure.error) {
        throw failure.error
    }
    return output
}

// The identity the program must have: the owner's uid and gid, and no other group, unless this process is not root and
// so cannot drop its own groups, which the program then has too.
const identity = ({uid, gid}) =>
    [String(uid), String(gid), (process.getuid() === 0 ? [gid] : process.getgroups()).join(',')]

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

// A write refused: answered with its status and reason, while the detail, naming server paths, stays in the log.
const refusal = (status, reason, detail = reason) =>
    Object.assign(new Error(detail), {status, reason})

const forbidden = detail =>
    refusal(403, 'Forbidden path', detail)

const badRequest = reason =>
    refusal(400, reason)

const conflict = () =>
    refusal(409, 'Cannot overwrite existing files')
