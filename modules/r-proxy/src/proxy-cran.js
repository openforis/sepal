import {getLogger} from '#sepal/log'
const log = getLogger('proxy/cran')
import fs from 'fs'
import {mkdir} from 'fs/promises'
import httpProxy from 'http-proxy'
import Path from 'path'

import {getCranPackageInfo, getCranRepoPath, getCranTarget, toBinaryPackagePath} from './cran.js'
import {checkTarget, serveError, serveFile} from './proxy-utils.js'
import {enqueueBuildCranPackage} from './queue.js'

const isPackage = name =>
    name !== 'PACKAGES'

const buildBinaryPackage = req => {
    const requestData = getCranPackageInfo(req.url)
    if (requestData) {
        const {name, path, version} = requestData
        if (isPackage(name)) {
            enqueueBuildCranPackage(name, path, version)
        } else {
            log.debug(`Skipping non-package ${name}`)
        }
    }
}

const proxy = httpProxy.createProxyServer({
    secure: false,
    changeOrigin: true,
    ignorePath: true,
    selfHandleResponse: true
})

proxy.on('proxyRes', (proxyRes, req, res, _options) => {
    const requestPath = req.url
    const {name} = getCranPackageInfo(requestPath)
    const repoPath = getCranRepoPath(requestPath)
    const tmpPath = `${repoPath}.tmp`
    const repoDir = Path.dirname(repoPath)
    if (proxyRes.statusCode === 200) {
        mkdir(repoDir, {recursive: true})
            .then(() => {
                if (isPackage(name)) {
                    const stream = fs.createWriteStream(tmpPath)
                    stream.on('finish', () => {
                        log.debug('Moving to', repoPath)
                        fs.renameSync(tmpPath, repoPath)
                        buildBinaryPackage(req)
                        log.debug('Proxied', req.url)
                    })
                    log.debug('Saving to', tmpPath)
                    proxyRes.pipe(stream)
                }
                proxyRes.pipe(res)
            })
            .catch(error => log.error('Cannot create dir:', error))
    } else {
        log.warn(`Failed proxy request (${proxyRes.statusCode}):`, req.url)
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        })
        res.end('Something went wrong.')
    }
})

proxy.on('error', (error, req, res) => {
    log.error('proxy error', error)
    res.writeHead(500, {
        'Content-Type': 'text/plain'
    })
    res.end('Something went wrong.')
})
    
const serveCachedBinary = async (req, res) =>
    await serveFile({res, path: getCranRepoPath(toBinaryPackagePath(req.url)), type: 'CRAN/binary'})

const serveCachedSource = async (req, res) =>
    await serveFile({res, path: getCranRepoPath(req.url), type: 'CRAN/source'})

const serveCached = async (req, res) => {
    const {name} = getCranPackageInfo(req.url)
    return isPackage(name) && (await serveCachedBinary(req, res) || await serveCachedSource(req, res))
}

const serveProxiedFile = async (req, res, target) => {
    if (await checkTarget(target, {allowRedirect: false})) {
        log.info(`Proxying ${req.url} to ${target}`)
        proxy.web(req, res, {target})
        return true
    } else {
        log.debug(`Cannot proxy ${req.url} to ${target}`)
    }
    return false
}

const serveProxied = async (req, res) => {
    const {base, name} = getCranPackageInfo(req.url)
    return await serveProxiedFile(req, res, getCranTarget(base, name, {archive: false}))
        || await serveProxiedFile(req, res, getCranTarget(base, name, {archive: true}))
        || await serveProxiedFile(req, res, getCranTarget(base, name, {transit: true}))
}

const serveCran = async (req, res) =>
    await serveCached(req, res) || await serveProxied(req, res) || await serveError(req, res)

export {serveCran}
