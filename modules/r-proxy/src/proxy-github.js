const log = require('sepal/log').getLogger('proxy/github')
const httpProxy = require('http-proxy')
const fs = require('fs')
const {mkdir} = require('fs/promises')
const Path = require('path')
const {getGitHubRepoPath, getGitHubTarget} = require('./filesystem')
const {enqueueBuildGitHubPackage} = require('./queue')
const {serveFile, checkTarget, serveError} = require('./proxy-utils')

const buildBinaryPackage = req => {
    const requestData = getRequestData(req)
    if (requestData) {
        const {name, path} = requestData
        enqueueBuildGitHubPackage(name, path)
    }
}

const proxy = httpProxy.createProxyServer({
    secure: false,
    changeOrigin: true,
    ignorePath: true,
    selfHandleResponse: true,
    followRedirects: true
})

proxy.on('proxyRes', (proxyRes, req, res, _options) => {
    const requestData = getRequestData(req)
    if (requestData) {
        const {path} = requestData
        const repoPath = getGitHubRepoPath('src', path)
        const tmpPath = `${repoPath}.tmp`
        const repoDir = Path.dirname(repoPath)
        if (proxyRes.statusCode === 200) {
            mkdir(repoDir, {recursive: true})
                .then(() => {
                    const stream = fs.createWriteStream(tmpPath)
                    stream.on('finish', () => {
                        log.debug('Moving to:', repoPath)
                        fs.renameSync(tmpPath, repoPath)
                        buildBinaryPackage(req)
                        log.debug('Proxied:', req.url)
                    })
                    log.debug('Saving to:', tmpPath)
                    proxyRes.pipe(stream)
                    proxyRes.pipe(res)
                })
                .catch(error => log.error('Cannot create dir:', error))
        } else {
            log.debug(`Failed proxy request (${proxyRes.statusCode}):`, req.url)
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            })
            res.end('Something went wrong.')
        }
    } else {
        log.warn('Failed proxy request (unknown path):', req.url)
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

const serveCachedBinary = async (req, res, path) =>
    await serveFile({res, path: getGitHubRepoPath('bin', path), type: 'GitHub/binary'})

const serveCachedSource = async (req, res, path) =>
    await serveFile({res, path: getGitHubRepoPath('src', path), type: 'GitHub/source'})
    
const serveCached = async (req, res, path) =>
    await serveCachedBinary(req, res, path) || await serveCachedSource(req, res, path)

const serveProxiedFile = async (req, res, target) => {
    if (await checkTarget(target, {allowRedirect: true})) {
        log.debug(`Proxying ${req.url} to ${target}`)
        proxy.web(req, res, {target})
        return true
    } else {
        log.debug(`Cannot proxy ${req.url} to ${target}`)
    }
    return false
}

const serveProxied = async (req, res, path) =>
    await serveProxiedFile(req, res, getGitHubTarget(path))

const serveGitHub = async (req, res) => {
    const requestData = getRequestData(req)
    if (requestData) {
        const {path} = requestData
        return await serveCached(req, res, path)
            || await serveProxied(req, res, path)
            || await serveError(req, res)
    }
    return await serveError(req, res)
}

const getRequestData = req => {
    const GITHUB_MATCHER = /^\/github\/(([^/]+)\/([^/]*)(.*)\.tar\.gz)/
    const result = req.url.match(GITHUB_MATCHER)
    if (result) {
        const [_, path, user, name, ref] = result
        return {path, user, name, ref}
    }
    return null
}

module.exports = {serveGitHub}
