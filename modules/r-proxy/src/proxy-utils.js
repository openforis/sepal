import fs from 'fs'
import {stat} from 'fs/promises'
import https from 'https'
import Path from 'path'

import {getLogger} from '#sepal/log'
const log = getLogger('proxy')

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
        if (error.code !== 'ENOENT') {
            log.warn(`Failed to serve ${type}:`, path, error)
        }
        return false
    }
}

const serveError = async (req, res) => {
    log.debug('Cannot serve:', req.url)
    res.writeHead(404, {'Content-Type': 'text/plain'})
    res.end('Not found')
    return false
}

export {checkTarget, serveError, serveFile}
