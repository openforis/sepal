const Path = require('path')
const {createReadStream, realpathSync, createWriteStream} = require('fs')
const {stat, readdir, realpath, mkdir, unlink, lstat, chown, chmod} = require('fs/promises')
const {spawn} = require('child_process')
const log = require('#sepal/log').getLogger('filesystem')

const resolvePath = (baseDir, path) => {
    const realBaseDir = realpathSync(baseDir)
    const absolutePath = realpathSync(Path.join(realBaseDir, path))
    const relativePath = Path.relative(realBaseDir, absolutePath)
    const isSubPath = (relativePath === '' || !relativePath.startsWith('..')) // Allow empty as subpath
    const isExternalPath = !!relativePath && relativePath.startsWith('..')
    return {
        absolutePath,
        relativePath,
        isSubPath,
        isExternalPath
    }
}

const getUserInfo = async username => {
    if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(username)) {
        throw new Error('Invalid username')
    }
    // Get user uid and gid
    try {
        const {stdout} = await new Promise((resolve, reject) => {
            const process = spawn('stat', ['-c', '%u %g', `/sepalUsers/${username}`])
            let stdout = ''
            
            process.stdout.on('data', data => stdout += data)
            process.on('close', code => {
                if (code === 0) {
                    resolve({stdout})
                } else {
                    reject(new Error('stat command failed'))
                }
            })
            process.on('error', reject)
        })
        
        const [uid, gid] = stdout.trim().split(' ').map(Number)
        return {uid, gid}
    } catch (error) {
        throw new Error(`User directory not found: ${username}`)
    }
}

const resolvePathSafe = (baseDir, path) => {
    try {
        return resolvePath(baseDir, path)
    } catch (error) {
        return {
            absolutePath: null,
            relativePath: null,
            isSubPath: false,
            isExternalPath: false,
            error: error.message
        }
    }
}

async function resolvePathForWrite(baseDir, relPath, username, op, recursive = false) {
    if (!relPath || relPath === '.' || Path.isAbsolute(relPath)) {
        throw new Error('Path must be a non-empty relative path')
    }
    const operation = op === 'writeFile' ? 'writeFile' : (op === 'mkdir' ? 'mkdir' : null)
    if (!operation) throw new Error('Invalid operation type')

    const userInfo = await getUserInfo(username)
    const baseAbs = await realpath(baseDir)
    const targetAbs = Path.join(baseAbs, relPath)

    const relFromBase = Path.relative(baseAbs, targetAbs)
    if (!relFromBase || relFromBase.startsWith('..') || Path.isAbsolute(relFromBase)) {
        throw new Error('Path escapes base directory')
    }

    const parts = relFromBase.split(Path.sep)
    let current = baseAbs
    let firstMissing = null

    for (let i = 0; i < parts.length; i++) {
        current = Path.join(current, parts[i])
        const isLast = i === parts.length - 1

        try {
            const st = await lstat(current)
            if (st.isSymbolicLink()) throw new Error(`${current} is a symlink`)
            if (!st.isDirectory() && !isLast) {
                throw new Error(`Parent path component is not a directory: ${current}`)
            }
            if (st.uid !== userInfo.uid) {
                throw new Error(`Cannot operate inside directories you do not own: ${current}`)
            }

            if (isLast) {
                if (operation === 'writeFile') {
                    if (st.isDirectory()) throw new Error('Target exists and is a directory')
                    return {targetAbs: current, userInfo, existed: true, firstMissing: null}
                } else {
                    if (!st.isDirectory()) throw new Error('Path exists but is not a directory')
                    return {targetAbs: current, userInfo, existed: true, firstMissing: null}
                }
            }
        } catch (err) {
            if (err?.code !== 'ENOENT') throw err
            if (!firstMissing) firstMissing = current
            if (!isLast) {
                if (operation === 'writeFile') {
                    throw new Error(`Parent directory does not exist: ${current}`)
                }
                if (!recursive) {
                    throw new Error(`Parent directory does not exist (enable recursive): ${current}`)
                }
            } else {
                return {targetAbs: current, userInfo, existed: false, firstMissing}
            }
        }
    }

    throw new Error('Unexpected fallthrough')
}

async function createDirectoryRecursive(targetAbs, userInfo, firstMissing) {
    if (!firstMissing) return
    const {uid, gid} = userInfo

    const validateOrCreateOwnedDir = async p => {
        try {
            const st = await lstat(p)
            if (st.isSymbolicLink()) throw new Error(`${p} is a symlink`)
            if (!st.isDirectory()) throw new Error(`${p} exists but is not a directory`)
            if (st.uid !== uid) throw new Error('Cannot create inside directories you do not own')
        } catch (err) {
            if (err?.code !== 'ENOENT') throw err
            await mkdir(p)
            await chown(p, uid, gid)
            await chmod(p, 0o755)
        }
    }

    const rel = Path.relative(firstMissing, targetAbs)
    let cur = firstMissing
    await validateOrCreateOwnedDir(cur)

    if (rel) {
        for (const part of rel.split(Path.sep).filter(Boolean)) {
            cur = Path.join(cur, part)
            await validateOrCreateOwnedDir(cur)
        }
    }
}

const getSepalUser = request => {
    const sepalUser = request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const download = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser && sepalUser.username) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir, isSubPath: validUserHome} = resolvePath(homeDir, username)
        if (!validUserHome) {
            log.warn('Cannot download - invalid user home:', userHomeDir)
            ctx.response.status = 404
            return
        }
        const path = ctx.query.path
        if (!path) {
            ctx.response.status = 400
            ctx.body = {error: 'No path specified'}
            return
        }
        try {
            const {absolutePath, isSubPath: validPath} = resolvePath(userHomeDir, path)
            if (!validPath) {
                log.warn('Cannot download - invalid path:', absolutePath)
                ctx.response.status = 404
                return
            }
            const filename = Path.parse(absolutePath).base
            const stats = await stat(absolutePath)
            if (stats.isFile()) {
                log.debug(() => `Downloading: ${absolutePath}`)
                ctx.body = createReadStream(absolutePath)
                ctx.attachment(filename)
            } else {
                log.warn(() => `Cannot download - non-file: ${absolutePath}`)
                ctx.response.status = 400
                ctx.body = {error: 'Cannot download - non-file, only files are supported'}
            }
        } catch (error) {
            ctx.response.status = 404
        }
    } else {
        log.warn(() => 'Cannot download - unauthenticated user')
        ctx.response.status = 401
    }
}

const setFile = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (!sepalUser || !sepalUser.username) {
        log.warn(() => 'Cannot set file: unauthenticated user')
        ctx.response.status = 401
        return
    }

    const relPath = ctx.query.path
    const upload = ctx.request.files?.file
    if (!relPath) {
        ctx.response.status = 400
        ctx.body = {error: 'No path specified'}
        return
    }
    if (!upload?.filepath) {
        ctx.response.status = 400
        ctx.body = {error: 'No file content provided'}
        return
    }

    try {
        const joinedRel = Path.join(sepalUser.username, relPath)
        const {targetAbs, existed, userInfo} = await resolvePathForWrite(
            homeDir, joinedRel, sepalUser.username, 'writeFile'
        )

        if (existed) {
            log.warn(() => `Cannot overwrite existing file: ${targetAbs}`)
            ctx.response.status = 409
            ctx.body = {error: 'Cannot overwrite existing files'}
            return
        }

        await new Promise((resolve, reject) => {
            const src = createReadStream(upload.filepath)
            const dst = createWriteStream(targetAbs, {flags: 'w'})
            src.on('error', reject)
            dst.on('error', reject)
            dst.on('finish', resolve)
            src.pipe(dst)
        })

        await chown(targetAbs, userInfo.uid, userInfo.gid)
        await chmod(targetAbs, 0o644)

        try { await unlink(upload.filepath) } catch {
            log.warn(() => `Error cleaning up temporary file: ${upload.filepath}`)
        }

        ctx.response.status = 200
        ctx.body = {message: 'File set successfully', path: relPath}
    } catch (error) {
        log.warn(() => `Error setting file: ${error.message}`)
        const msg = ('' + error.message).toLowerCase()
        if (msg.includes('escape') || msg.includes('symlink') || msg.includes('own') || msg.includes('parent')) {
            ctx.response.status = 403
            ctx.body = {error: 'Forbidden path'}
        } else if (msg.includes('directory')) {
            ctx.response.status = 400
            ctx.body = {error: error.message}
        } else {
            ctx.response.status = 500
            ctx.body = {error: 'Failed to write file'}
        }
    }
}

const createFolder = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (!sepalUser || !sepalUser.username) {
        log.warn(() => 'Cannot create directory: unauthenticated user')
        ctx.response.status = 401
        return
    }

    const username = sepalUser.username
    const path = ctx.query.path
    const recursive = ctx.query.recursive === 'true'
    if (!path) {
        ctx.response.status = 400
        ctx.body = {error: 'No path specified'}
        return
    }

    try {
        const joinedRel = Path.join(username, path)

        const {targetAbs, existed, userInfo, firstMissing} = await resolvePathForWrite(
            homeDir, joinedRel, username, 'mkdir', recursive
        )

        if (existed) {
            log.warn(() => `Directory already exists: ${targetAbs}`)
            ctx.response.status = 409
            ctx.body = {error: 'Directory already exists'}
            return
        }

        if (recursive) {
            await createDirectoryRecursive(targetAbs, userInfo, firstMissing)
        } else {
            await mkdir(targetAbs)
            await chown(targetAbs, userInfo.uid, userInfo.gid)
            await chmod(targetAbs, 0o755)
        }

        const userHomeDir = Path.join(homeDir, username)
        ctx.response.status = 201
        ctx.body = {
            message: 'Directory created successfully',
            path: Path.relative(userHomeDir, targetAbs)
        }

    } catch (error) {
        log.error(() => `Error creating directory: ${error.message}`)
        const msg = ('' + error.message).toLowerCase()
        if (msg.includes('exists but is not a directory')) {
            ctx.response.status = 400
            ctx.body = {error: 'Path exists but is not a directory'}
        } else if (msg.includes('escape') || msg.includes('symlink') || msg.includes('own') || msg.includes('parent')) {
            ctx.response.status = 403
            ctx.body = {error: 'Forbidden path'}
        } else {
            ctx.response.status = 500
            ctx.body = {error: 'Failed to create directory', details: error.message}
        }
    }
}

const listFiles = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (!sepalUser?.username) {
        log.warn(() => 'Cannot list files: unauthenticated user')
        ctx.response.status = 401
        return
    }

    const {absolutePath: userHomeDir, isSubPath} = resolvePath(homeDir, sepalUser.username)
    if (!isSubPath) {
        log.warn('Cannot list files - invalid user home:', userHomeDir)
        ctx.response.status = 404
        return
    }

    const q = ctx.query || {}
    const relPath = q.path || '.'
    const includeHidden = q.includeHidden === 'true'
    const exts = q.extensions ? new Set(q.extensions.split(',').map(s => s.trim())) : null

    const pathResult = resolvePathSafe(userHomeDir, relPath)
    if (pathResult.error || !pathResult.isSubPath) {
        log.warn('Cannot list files - invalid path:', pathResult.absolutePath || pathResult.error)
        ctx.response.status = 404
        return
    }
    const absolutePath = pathResult.absolutePath

    try {
        const st = await stat(absolutePath)
        if (!st.isDirectory()) {
            log.warn(() => `Cannot list non-directory: ${absolutePath}`)
            ctx.response.status = 404
            return
        }

        const names = await readdir(absolutePath)
        const visible = includeHidden ? names : names.filter(n => !n.startsWith('.'))

        const describe = async name => {
            const filePath = Path.join(absolutePath, name)
            try {
                const fst = await lstat(filePath) // don't follow symlinks
                const isDir = fst.isDirectory()
                const isLink = fst.isSymbolicLink()

                if (!isDir && exts) {
                    const ext = Path.extname(name)
                    if (!exts.has(ext)) return null
                }

                return {
                    name,
                    path: Path.relative(userHomeDir, filePath),
                    type: isDir ? 'directory' : (isLink ? 'symlink' : 'file'),
                    size: fst.size, // for symlinks: size of link itself
                    modifiedTime: fst.mtime,
                    ...(isLink ? {isSymlink: true} : null),
                }
            } catch (e) {
                log.warn(() => `Skipping inaccessible entry: ${filePath}, error: ${e.message}`)
                return null
            }
        }

        const fileDetailsArray = await Promise.all(visible.map(describe))
        const files = fileDetailsArray.filter(Boolean)

        files.sort((a, b) => (a.type === 'directory') === (b.type === 'directory')
            ? a.name.localeCompare(b.name)
            : (a.type === 'directory' ? -1 : 1))

        ctx.body = {path: Path.relative(userHomeDir, absolutePath), files}
    } catch (error) {
        log.error(() => `Error listing directory: ${error.message}`)
        ctx.response.status = 500
        ctx.body = {error: 'Failed to list directory contents'}
    }
}

module.exports = {resolvePath, download, listFiles, setFile, createFolder}

