const Path = require('path')
const {createReadStream, realpathSync} = require('fs')
const {stat, readdir, realpath, writeFile, mkdir} = require('fs/promises')
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

const resolvePathForWrite = async (baseDir, relPath) => {
    const realBaseDir = await realpath(baseDir)
    const joinedPath = Path.join(realBaseDir, relPath)
    const relativePath = Path.relative(realBaseDir, joinedPath)
    const isSubPath = !!relativePath && !relativePath.startsWith('..') && !Path.isAbsolute(relativePath)
    const isExternalPath = !isSubPath
  
    if (isExternalPath) {
        throw new Error('The provided path resolves outside the allowed base directory.')
    }
    
    return {
        absolutePath: joinedPath,
        relativePath,
        isSubPath,
        isExternalPath
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
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir} = resolvePath(homeDir, username)
        const path = ctx.query.path
        const {absolutePath} = resolvePath(userHomeDir, path)
        const filename = Path.parse(absolutePath).base
        const stats = await stat(absolutePath)
        if (stats.isFile()) {
            log.debug(() => `Downloading: ${absolutePath}`)
            ctx.body = createReadStream(absolutePath)
            ctx.attachment(filename)
        } else {
            log.warn(() => `Cannot download non-file: ${absolutePath}`)
            ctx.response.status = 404
        }
    } else {
        log.warn(() => 'Cannot download: unauthenticated user')
        ctx.response.status = 401
    }
}

const setFile = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir} = resolvePath(homeDir, username)
        const path = ctx.query.path
        
        if (!path) {
            log.warn(() => 'No path specified for file')
            ctx.response.status = 400
            ctx.body = {error: 'No path specified'}
            return
        }

        try {
            const {absolutePath} = await resolvePathForWrite(userHomeDir, path)
            const dirPath = Path.dirname(absolutePath)
            
            // Check if parent directory exists
            try {
                const stats = await stat(dirPath)
                if (!stats.isDirectory()) {
                    ctx.response.status = 400
                    ctx.body = {error: 'Parent path exists but is not a directory'}
                    return
                }
            } catch (error) {
                ctx.response.status = 404
                ctx.body = {error: 'Parent directory does not exist. Use createFolder endpoint first.'}
                return
            }
            
            log.debug(() => `Setting file: ${absolutePath}`)
            
            // Get content from the request
            const file = ctx.request.body?.file
            if (file) {
                await writeFile(absolutePath, file)
            } else {
                log.warn(() => 'No file content provided')
                ctx.response.status = 400
                ctx.body = {error: 'No file content provided'}
                return
            }
            
            ctx.response.status = 200
            ctx.body = {
                message: 'File set successfully',
                path: Path.relative(userHomeDir, absolutePath)
            }
        } catch (error) {
            log.error(() => `Error setting file: ${error.message}`)
            ctx.response.status = 500
            ctx.body = {error: 'Failed to write file'}
        }
    } else {
        log.warn(() => 'Cannot set file: unauthenticated user')
        ctx.response.status = 401
    }
}

const createFolder = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir} = resolvePath(homeDir, username)
        const path = ctx.query.path
        const recursive = ctx.query.recursive === 'true'
        
        if (!path) {
            log.warn(() => 'No path specified for folder creation')
            ctx.response.status = 400
            ctx.body = {error: 'No path specified'}
            return
        }

        try {
            // use resolvePathForWrite to check if a path that doesn't exist can be created
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
        const {absolutePath: userHomeDir} = resolvePath(homeDir, username)
        const path = ctx.query.path || '.'
        const includeHidden = ctx.query.includeHidden === 'true'
        const {absolutePath} = resolvePath(userHomeDir, path)
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

