const Path = require('path')
const {createReadStream, realpathSync, createWriteStream} = require('fs')
const {stat, readdir, realpath, mkdir, unlink, lstat} = require('fs/promises')

const log = require('#sepal/log').getLogger('filesystem')
const resolvePath = (baseDir, path) => {
    const realBaseDir = realpathSync(baseDir)
    const absolutePath = realpathSync(Path.join(realBaseDir, path))
    const relativePath = Path.relative(realBaseDir, absolutePath)
    const isSubPath = !!relativePath && !relativePath.startsWith('..')
    const isExternalPath = !!relativePath && relativePath.startsWith('..')
    return {
        absolutePath,
        relativePath,
        isSubPath,
        isExternalPath
    }
}

async function resolvePathForWrite(baseDir, relPath) {
    if (!relPath || relPath === '.' || Path.isAbsolute(relPath)) {
        throw new Error('Path must be a non-empty relative path')
    }
    const baseAbs = await realpath(baseDir)
    const targetAbs = Path.join(baseAbs, relPath)
    const rel = Path.relative(baseAbs, targetAbs)
    if (rel === '' || rel.startsWith('..') || Path.isAbsolute(rel)) {
        throw new Error('Path escapes base directory')
    }
    const parts = rel.split(Path.sep)
    let current = baseAbs
    for (let i = 0; i < parts.length; i++) {
        current = Path.join(current, parts[i])
        const isLast = i === parts.length - 1
        try {
            const st = await lstat(current)
            if (st.isSymbolicLink()) {
                throw new Error('Symlinks are not allowed')
            }
            if (isLast) {
                if (st.isDirectory()) {
                    throw new Error('Target exists and is a directory')
                }
                if (!st.isFile()) {
                    throw new Error('Target exists but is not a regular file')
                }
                return {baseAbs, targetAbs: current, rel, existed: true}
            } else if (!st.isDirectory()) {
                throw new Error('Parent path component is not a directory')
            }
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                if (isLast) {
                    return {baseAbs, targetAbs, rel, existed: false}
                }
                throw new Error('Parent directory does not exist')
            }
            throw err
        }
    }
    throw new Error('Unexpected resolution state')
}

const getSepalUser = request => {
    const sepalUser = request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const download = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir, isSubPath: validUserHome} = resolvePath(homeDir, username)
        if (!validUserHome) {
            log.warn('Cannot download - invalid user home:', userHomeDir)
            ctx.response.status = 404
            return
        }
        const path = ctx.query.path
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
                ctx.response.status = 404
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
    if (!sepalUser) {
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
        const {targetAbs} = await resolvePathForWrite(homeDir, joinedRel)

        log.debug(() => `Setting file: ${targetAbs}`)

        await new Promise((resolve, reject) => {
            const src = createReadStream(upload.filepath)
            const dst = createWriteStream(targetAbs, {flags: 'w'})
            src.on('error', reject)
            dst.on('error', reject)
            dst.on('finish', resolve)
            src.pipe(dst)
        })

        try { await unlink(upload.filepath) } catch { /* empty */ }

        ctx.response.status = 200
        ctx.body = {message: 'File set successfully', path: relPath}
    } catch (error) {
        log.warn(() => `Error setting file: ${error.message}`)
        ctx.response.status = 500
        ctx.body = {error: 'Failed to write file'}
    }
}

const createFolder = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir, isSubPath: validUserHome} = resolvePath(homeDir, username)
        if (!validUserHome) {
            log.warn('Cannot create folder - invalid user home:', userHomeDir)
            ctx.response.status = 404
            return
        }
        const path = ctx.query.path
        const recursive = ctx.query.recursive === 'true'
        
        if (!path) {
            log.warn(() => 'No path specified for folder creation')
            ctx.response.status = 400
            ctx.body = {error: 'No path specified'}
            return
        }

        try {

            const {absolutePath} = await resolvePathForWrite(userHomeDir, path)
            
            try {
                const stats = await stat(absolutePath)
                if (stats.isDirectory()) {
                    log.debug(() => `Directory already exists: ${absolutePath}`)
                    ctx.response.status = 200
                    ctx.body = {
                        message: 'Directory already exists',
                        path: Path.relative(userHomeDir, absolutePath)
                    }
                    return
                } else {
                    ctx.response.status = 400
                    ctx.body = {error: 'Path exists but is not a directory'}
                    return
                }
            } catch (error) {
                await mkdir(absolutePath, {recursive})
                log.debug(() => `Created directory: ${absolutePath}`)
                ctx.response.status = 201
                ctx.body = {
                    message: 'Directory created successfully',
                    path: Path.relative(userHomeDir, absolutePath)
                }
            }
        } catch (error) {
            log.error(() => `Error creating directory: ${error.message}`)
            ctx.response.status = 500
            ctx.body = {
                error: 'Failed to create directory',
                details: recursive ? 'Ensure all parent directories exist or use recursive=true' : 'Parent directory must exist'
            }
        }
    } else {
        log.warn(() => 'Cannot create directory: unauthenticated user')
        ctx.response.status = 401
    }
}

const listFiles = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir, isSubPath: validUserHome} = resolvePath(homeDir, username)
        if (!validUserHome) {
            log.warn('Cannot list files - invalid user home:', userHomeDir)
            ctx.response.status = 404
            return
        }
        const path = ctx.query.path || '.'
        const includeHidden = ctx.query.includeHidden === 'true'
        const {absolutePath, isSubPath: validPath} = resolvePath(userHomeDir, path)
        if (!validPath) {
            log.warn('Cannot list files - invalid path:', absolutePath)
            ctx.response.status = 404
            return
        }
        const extensionsParam = ctx.query.extensions
        const extensions = extensionsParam
            ? extensionsParam.split(',').map(ext => ext.trim())
            : null
        log.debug(() => `Extensions filter: ${extensions}`)
        
        try {
            const stats = await stat(absolutePath)
            if (stats.isDirectory()) {
                const files = await readdir(absolutePath)
                const fileDetailsArray = await Promise.all(
                    files
                        .filter(file => includeHidden || !file.startsWith('.'))
                        .map(async file => {
                            const filePath = Path.join(absolutePath, file)
                            const fileStats = await stat(filePath)
                            if (!fileStats.isDirectory() && extensions) {
                                const fileExt = Path.extname(file)
                                if (!extensions.includes(fileExt)) {
                                    return null
                                }
                            }
                            return {
                                name: file,
                                path: Path.relative(userHomeDir, filePath),
                                type: fileStats.isDirectory() ? 'directory' : 'file',
                                size: fileStats.size,
                                modifiedTime: fileStats.mtime
                            }
                        })
                )
  
                const fileDetails = fileDetailsArray.filter(detail => detail !== null)
  
                log.debug(() => `Listing directory: ${absolutePath}`)
                ctx.body = {
                    path: Path.relative(userHomeDir, absolutePath),
                    files: fileDetails
                }
                log.debug(() => `Listed ${fileDetails.length} files`)
            } else {
                log.warn(() => `Cannot list non-directory: ${absolutePath}`)
                ctx.response.status = 404
            }
        } catch (error) {
            log.error(() => `Error listing directory: ${error.message}`)
            ctx.response.status = 500
            ctx.body = {error: 'Failed to list directory contents'}
        }
    } else {
        log.warn(() => 'Cannot list files: unauthenticated user')
        ctx.response.status = 401
    }
}

module.exports = {resolvePath, download, listFiles, setFile, createFolder}

