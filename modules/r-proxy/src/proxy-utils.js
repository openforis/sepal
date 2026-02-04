const log = require('#sepal/log').getLogger('proxy')
const https = require('https')
const fs = require('fs')
const {stat} = require('fs/promises')
const Path = require('path')

const checkTarget = (url, {allowRedirect} = {}) =>
    new Promise((resolve, reject) => {
        try {
            const request = https.request(url, {method: 'HEAD'}, res =>
                resolve((allowRedirect ? [200, 302] : [200]).includes(res.statusCode))
            )
            request.end()
        } catch (error) {
            reject(error)
        }
    })

const serveFile = async ({res, path, type}) => {
    try {
        const requestStat = await stat(path)
        if (requestStat.isFile()) {
            log.info(`Serving ${type}:`, path)
            res.setHeader('Content-Disposition', `attachment; filename="${Path.basename(path)}"`)
            fs.createReadStream(path).pipe(res)
            return true
        }
        return false
    } catch (error) {
        return false
    }
}

const serveError = async (req, res) => {
    log.debug('Cannot serve:', req.url)
    res.end()
    return false
}

module.exports = {checkTarget, serveFile, serveError}
