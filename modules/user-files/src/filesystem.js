const Path = require('path')
const {createReadStream, realpathSync} = require('fs')
const {stat} = require('fs/promises')
const log = require('#sepal/log').getLogger('filesystem')

const resolvePath = (baseDir, path) => {
    const realBaseDir = realpathSync(baseDir)
    const absolutePath = realpathSync(Path.join(realBaseDir, path))
    const relativePath = Path.relative(realBaseDir, absolutePath)
    const isSubPath = !!relativePath && !relativePath.startsWith('..')
    return {
        absolutePath,
        relativePath,
        isSubPath
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

module.exports = {resolvePath, download}
