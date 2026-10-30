import {randomUUID} from 'node:crypto'
import fs from 'node:fs'
import {mkdir, rename, rm, stat} from 'node:fs/promises'
import https from 'node:https'
import Path from 'node:path'
import {pipeline} from 'node:stream'
import {pipeline as pipelinePromise} from 'node:stream/promises'
import {setTimeout} from 'node:timers/promises'

import httpProxy from 'http-proxy'

import {getLogger} from '#sepal/log'

const log = getLogger('proxy')

// CRAN resets some connections
const UPSTREAM_ATTEMPTS = 3
const UPSTREAM_RETRY_DELAY_MS = 1000

const checkTarget = async (url, {allowRedirect} = {}, attempt = 1) => {
    try {
        return await headTarget(url, {allowRedirect})
    } catch (error) {
        if (attempt >= UPSTREAM_ATTEMPTS) {
            throw error
        }
        log.warn(`Retrying HEAD ${url}:`, error.message)
        await setTimeout(UPSTREAM_RETRY_DELAY_MS)
        return await checkTarget(url, {allowRedirect}, attempt + 1)
    }
}

const headTarget = (url, {allowRedirect}) =>
    new Promise((resolve, reject) => {
        const request = https.request(url, {method: 'HEAD'}, res => {
            res.resume()
            resolve((allowRedirect ? [200, 302] : [200]).includes(res.statusCode))
        })
        request.on('error', reject)
        request.end()
    })

// Returns a function proxying a request to a target. A request is retried only until its upstream response
// arrives: from then on, onResponse owns the response, and part of it may have been forwarded.
const createProxy = ({onResponse, ...options}) => {
    const proxy = httpProxy.createProxyServer(options)
    const responded = new WeakSet()
    proxy.on('proxyRes', (proxyRes, req, res) => {
        responded.add(req)
        onResponse(proxyRes, req, res)
    })
    const proxyRequest = (req, res, target, attempt = 1) =>
        proxy.web(req, res, {target}, error => {
            if (responded.has(req) || attempt >= UPSTREAM_ATTEMPTS) {
                log.error('Failed proxy request:', req.url, error)
                serveFailure(res)
            } else {
                log.warn(`Retrying proxy request ${req.url}:`, error.message)
                setTimeout(UPSTREAM_RETRY_DELAY_MS).then(() => proxyRequest(req, res, target, attempt + 1))
            }
        })
    return proxyRequest
}

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

export {checkTarget, createProxy, forwardAndCache, serveError, serveFailure, serveFile}
