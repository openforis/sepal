const Path = require('path')
const {createReadStream, realpathSync} = require('fs')
const {stat, readdir} = require('fs/promises')
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

const listFiles = async (homeDir, ctx) => {
    const sepalUser = getSepalUser(ctx.request)
    if (sepalUser) {
        const username = sepalUser.username
        const {absolutePath: userHomeDir} = resolvePath(homeDir, username)
        const path = ctx.query.path || '.'
        const {absolutePath} = resolvePath(userHomeDir, path)
        
        try {
            const stats = await stat(absolutePath)
            if (stats.isDirectory()) {
                const files = await readdir(absolutePath)
                const fileDetails = await Promise.all(
                    files.map(async file => {
                        const filePath = Path.join(absolutePath, file)
                        const fileStats = await stat(filePath)
                        return {
                            name: file,
                            path: Path.relative(userHomeDir, filePath),
                            type: fileStats.isDirectory() ? 'directory' : 'file',
                            size: fileStats.size,
                            modifiedTime: fileStats.mtime
                        }
                    })
                )
                
                log.debug(() => `Listing directory: ${absolutePath}`)
                ctx.body = {
                    path: Path.relative(userHomeDir, absolutePath),
                    files: fileDetails
                }
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

module.exports = {resolvePath, download, listFiles}

