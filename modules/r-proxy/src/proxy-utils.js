import {randomUUID} from 'node:crypto'
import fs from 'node:fs'
import {mkdir, rename, rm, stat} from 'node:fs/promises'
import https from 'node:https'
import Path from 'node:path'
import {pipeline} from 'node:stream'
import {pipeline as pipelinePromise} from 'node:stream/promises'

import {getLogger} from '#sepal/log'

const log = getLogger('proxy')

const checkTarget = (url, {allowRedirect} = {}) =>
    new Promise((resolve, reject) => {
        const request = https.request(url, {method: 'HEAD'}, res => {
            res.resume()
            resolve((allowRedirect ? [200, 302] : [200]).includes(res.statusCode))
        })
        request.on('error', reject)
        request.end()
    })

// Each response gets its own temporary file, so concurrent downloads of one package cannot interleave.
const forwardAndCache = async ({proxyRes, res, path}) => {
    const tmpPath = `${path}.${randomUUID()}.tmp`
    try {
        await mkdir(Path.dirname(path), {recursive: true})
        const cached = pipelinePromise(proxyRes, fs.createWriteStream(tmpPath))
        proxyRes.pipe(res)
        await cached
        await rename(tmpPath, path)
    } catch (error) {
        proxyRes.destroy()
        await rm(tmpPath, {force: true})
        throw error
    }
}

const serveFile = async ({res, path, type}) => {
    try {
        const requestStat = await stat(path)
        if (requestStat.isFile()) {
            log.info(`Serving ${type}:`, path)
            res.setHeader('Content-Disposition', `attachment; filename="${Path.basename(path)}"`)
            pipeline(fs.createReadStream(path), res, error => {
                if (error) {
                    log.warn(`Failed to serve ${type}:`, path, error.message)
                }
            })
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

const serveFailure = res => {
    if (res.headersSent) {
        res.destroy()
    } else {
        res.writeHead(500, {'Content-Type': 'text/plain'})
        res.end('Something went wrong.')
    }
}

export {checkTarget, forwardAndCache, serveError, serveFailure, serveFile}
