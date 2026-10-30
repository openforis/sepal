import {getLogger} from '#sepal/log'

import {getGitHubPackageInfo, getGitHubRepoPath, getGitHubTarget} from './github.js'
import {checkTarget, createProxy, forwardAndCache, serveError, serveFailure, serveFile} from './proxy-utils.js'
import {enqueueBuildGitHubPackage} from './queue.js'

const log = getLogger('proxy/github')

const buildBinaryPackage = ({name, path}) =>
    enqueueBuildGitHubPackage(name, path)
        .catch(error => log.error(`Cannot enqueue build of ${name}:`, error))

const forwardResponse = async (proxyRes, req, res) => {
    const requestData = getGitHubPackageInfo(req.url)
    if (!requestData) {
        log.warn('Failed proxy request (unknown path):', req.url)
        proxyRes.resume()
        serveFailure(res)
    } else if (proxyRes.statusCode === 200) {
        try {
            await forwardAndCache({proxyRes, res, path: getGitHubRepoPath('src', requestData.path)})
            buildBinaryPackage(requestData)
            log.debug('Proxied', req.url)
        } catch (error) {
            log.warn('Failed proxy request:', req.url, error.message)
            serveFailure(res)
        }
    } else {
        log.debug(`Failed proxy request (${proxyRes.statusCode}):`, req.url)
        proxyRes.resume()
        serveFailure(res)
    }
}

const proxyRequest = createProxy({
    secure: false,
    changeOrigin: true,
    ignorePath: true,
    selfHandleResponse: true,
    followRedirects: true,
    onResponse: forwardResponse
})

const serveCachedBinary = async (req, res, path) =>
    await serveFile({res, path: getGitHubRepoPath('bin', path), type: 'GitHub/binary'})

const serveCachedSource = async (req, res, path) =>
    await serveFile({res, path: getGitHubRepoPath('src', path), type: 'GitHub/source'})
    
const serveCached = async (req, res, path) =>
    await serveCachedBinary(req, res, path) || await serveCachedSource(req, res, path)

const serveProxiedFile = async (req, res, target) => {
    if (await checkTarget(target, {allowRedirect: true})) {
        log.info(`Proxying ${req.url} to ${target}`)
        proxyRequest(req, res, target)
        return true
    } else {
        log.debug(`Cannot proxy ${req.url} to ${target}`)
    }
    return false
}

const serveProxied = async (req, res, path) =>
    await serveProxiedFile(req, res, getGitHubTarget(path))

const serveGitHub = async (req, res) => {
    const requestData = getGitHubPackageInfo(req.url)
    if (requestData) {
        const {path} = requestData
        return await serveCached(req, res, path)
            || await serveProxied(req, res, path)
            || await serveError(req, res)
    }
    return await serveError(req, res)
}

export {serveGitHub}
