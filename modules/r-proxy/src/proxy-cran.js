import {getLogger} from '#sepal/log'

import {getCranPackageInfo, getCranRepoPath, getCranTarget, toBinaryPackagePath} from './cran.js'
import {checkTarget, createProxy, forwardAndCache, serveError, serveFailure, serveFile} from './proxy-utils.js'
import {enqueueBuildCranPackage} from './queue.js'

const log = getLogger('proxy/cran')

const isPackage = name =>
    name !== 'PACKAGES'

const buildBinaryPackage = req => {
    const {name, path, version} = getCranPackageInfo(req.url)
    enqueueBuildCranPackage(name, path, version)
        .catch(error => log.error(`Cannot enqueue build of ${name}:`, error))
}

const forwardResponse = async (proxyRes, req, res) => {
    if (proxyRes.statusCode === 200) {
        const {name} = getCranPackageInfo(req.url)
        if (isPackage(name)) {
            try {
                await forwardAndCache({proxyRes, res, path: getCranRepoPath(req.url)})
                buildBinaryPackage(req)
                log.debug('Proxied', req.url)
            } catch (error) {
                log.warn('Failed proxy request:', req.url, error.message)
                serveFailure(res)
            }
        } else {
            proxyRes.pipe(res)
        }
    } else {
        log.warn(`Failed proxy request (${proxyRes.statusCode}):`, req.url)
        proxyRes.resume()
        serveFailure(res)
    }
}

const proxyRequest = createProxy({
    secure: false,
    changeOrigin: true,
    ignorePath: true,
    selfHandleResponse: true,
    onResponse: forwardResponse
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
        proxyRequest(req, res, target)
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
