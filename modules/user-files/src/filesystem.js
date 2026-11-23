import {constants} from 'node:fs'
import {open, readdir, stat} from 'node:fs/promises'
import Path from 'node:path'

import {lastValueFrom} from 'rxjs'

import {getLogger} from '#sepal/log'

import {describeEntries$, describeEntry, resolvePath} from './homePath.js'
import {createFolders, publishFile, resolveWritePath} from './homeWrite.js'

const log = getLogger('filesystem')

export const download = authenticated(async (homeDir, ctx, username) => {
    const {path} = ctx.query
    if (!path) {
        return respond(ctx, 400, {error: 'No path specified'})
    }
    try {
        const resolved = await resolvePath(await resolvePath(homeDir, username), path)
        const file = await openFile(resolved)
        if (!file) {
            log.warn(`Cannot download - non-file: ${resolved}`)
            return respond(ctx, 400, {error: 'Cannot download - non-file, only files are supported'})
        }
        log.debug(`Downloading: ${resolved}`)
        ctx.body = file.createReadStream()
        ctx.attachment(Path.basename(path))
    } catch (error) {
        log.warn('Cannot download', error)
        ctx.response.status = 404
    }
})

export const listFiles = authenticated(async (homeDir, ctx, username) => {
    const query = ctx.query || {}
    const directory = await findDirectory(homeDir, username, query.path || '.')
    if (!directory) {
        ctx.response.status = 404
        return
    }
    try {
        const files = await listDirectory(directory, {
            includeHidden: query.includeHidden === 'true',
            extensions: query.extensions && new Set(query.extensions.split(',').map(extension => extension.trim()))
        })
        ctx.body = {path: directory.path, files, count: files.length}
    } catch (error) {
        log.error(() => `Error listing directory: ${error.message}`)
        respond(ctx, 500, {error: 'Failed to list directory contents'})
    }
})

// Publishes the one file of an upload; upload.js removes its temporary files.
export const setFile = authenticated(async (homeDir, ctx, username) => {
    const {path, overwrite} = ctx.query
    const files = ctx.request.files || {}
    if (!path) {
        return respond(ctx, 400, {error: 'No path specified'})
    }
    if (Object.values(files).flat().length > 1) {
        return respond(ctx, 400, {error: 'Only a single file is supported'})
    }
    if (!files.file?.filepath) {
        return respond(ctx, 400, {error: 'No file content provided'})
    }
    try {
        const {target, owner, existed} = await resolveWritePath(homeDir, username, path)
        if (existed && overwrite !== 'true') {
            log.warn(() => `Cannot overwrite existing file: ${target}`)
            return respond(ctx, 409, {error: 'Cannot overwrite existing files'})
        }
        await publishFile(files.file.filepath, target, owner, {overwrite: overwrite === 'true'})
        // Whether a file was there when the request was checked: another may have created or replaced one since.
        respond(ctx, 200, {
            message: existed ? 'File overwritten successfully' : 'File created successfully',
            path,
            overwritten: existed
        })
    } catch (error) {
        log.warn(() => `Error setting file: ${error.message}`)
        respondFailure(ctx, error, {error: 'Failed to write file'})
    }
})

export const createFolder = authenticated(async (homeDir, ctx, username) => {
    const {path, recursive} = ctx.query
    if (!path) {
        return respond(ctx, 400, {error: 'No path specified'})
    }
    try {
        const {home, target, owner, existed, firstMissing} =
            await resolveWritePath(homeDir, username, path, {directory: true, recursive: recursive === 'true'})
        if (existed) {
            log.warn(() => `Directory already exists: ${target}`)
            return respond(ctx, 409, {error: 'Directory already exists'})
        }
        await createFolders(firstMissing, target, owner)
        respond(ctx, 201, {message: 'Directory created successfully', path: Path.relative(home, target)})
    } catch (error) {
        log.error(() => `Error creating directory: ${error.message}`)
        respondFailure(ctx, error, {error: 'Failed to create directory'})
    }
})

// Handles a request of a SEPAL user, refusing any other. Declared as a function to be hoisted above the handlers.
function authenticated(handle) {
    return async (homeDir, ctx) => {
        const username = sepalUser(ctx.request)?.username
        if (!username) {
            log.warn(() => `Refusing unauthenticated request: ${ctx.path}`)
            ctx.response.status = 401
            return
        }
        return handle(homeDir, ctx, username)
    }
}

// A regular file opened to stream, judged by what was opened rather than by an earlier look at the path: anything
// else put there meanwhile is closed again and refused, and a FIFO is opened without waiting for a writer.
const openFile = async path => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
    const stats = await handle.stat().catch(error => closing(handle, error))
    if (stats.isFile()) {
        return handle
    }
    await handle.close()
    return null
}

const closing = async (handle, error) => {
    await handle.close()
    throw error
}

const sepalUser = request => {
    const header = request.headers['sepal-user']
    return header ? JSON.parse(header) : {}
}

// The directory asked for in the user's home: where it is, and its path as asked, which a linked directory is
// listed under. None when the path does not lead to a directory in the home.
const findDirectory = async (homeDir, username, path) => {
    try {
        const home = await resolvePath(homeDir, username)
        const absolutePath = await resolvePath(home, path)
        const isDirectory = (await stat(absolutePath)).isDirectory()
        return isDirectory ? {home, absolutePath, path: Path.relative(home, Path.join(home, path))} : null
    } catch (error) {
        log.warn(`Cannot list files - unresolvable path: ${path} (${error.code})`)
        return null
    }
}

const listDirectory = async ({home, absolutePath, path}, {includeHidden, extensions}) => {
    const names = (await readdir(absolutePath)).filter(name => includeHidden || !name.startsWith('.'))
    const entries = await lastValueFrom(describeEntries$(names, name => listEntry(home, absolutePath, path, name)))
    return entries
        .filter(entry => !extensions || entry.type === 'directory' || extensions.has(Path.extname(entry.name)))
        .sort(directoriesFirst)
}

const listEntry = async (home, directory, path, name) => {
    try {
        const {stats, link} = await describeEntry(home, Path.join(directory, name))
        return {
            name,
            path: Path.join(path, name),
            type: stats.isDirectory() ? 'directory' : (stats.isSymbolicLink() ? 'symlink' : 'file'),
            size: stats.size,
            modifiedTime: stats.mtime,
            ...link
        }
    } catch (error) {
        log.warn(() => `Skipping inaccessible entry: ${Path.join(directory, name)}, error: ${error.message}`)
        return null
    }
}

const directoriesFirst = (a, b) =>
    (a.type === 'directory') === (b.type === 'directory')
        ? a.name.localeCompare(b.name)
        : (a.type === 'directory' ? -1 : 1)

const respond = (ctx, status, body) => {
    ctx.response.status = status
    ctx.body = body
}

// A refused write is answered with its status and reason, anything else that failed as a server error.
const respondFailure = (ctx, error, serverError) =>
    error.status
        ? respond(ctx, error.status, {error: error.reason})
        : respond(ctx, 500, serverError)
