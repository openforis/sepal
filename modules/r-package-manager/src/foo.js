const Path = require('path')
const {createReadStream, realpathSync} = require('fs')
// const {stat} = require('fs/promises')
const log = require('sepal/log').getLogger('package')
const {repoDir} = require('./config')

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

const getPackage = async ctx => {
    const path = ctx.query.path
    const {absolutePath} = resolvePath(repoDir, path)
    log.debug({repoDir, path, absolutePath})
    ctx.body = createReadStream(absolutePath)
}

module.exports = {getPackage}
