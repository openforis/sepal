const log = require('#sepal/log').getLogger('proxy/cran')
const httpProxy = require('http-proxy')
const fs = require('fs')
const {mkdir} = require('fs/promises')
const Path = require('path')
const {getCranRepoPath, getCranTarget, toBinaryPackagePath, getCranPackageInfo} = require('./cran')
const {enqueueBuildCranPackage} = require('./queue')
const {serveFile, checkTarget, serveError} = require('./proxy-utils')

const buildBinaryPackage = req => {
    const requestData = getCranPackageInfo(req.url)
    if (requestData) {
        const {name, version} = requestData
        if (name !== 'PACKAGES') {
            enqueueBuildCranPackage(name, version)
        } else {
            log.debug(`Skipping ${name}`)
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
                if (name !== 'PACKAGES') {
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
        log.debug(`Failed proxy request (${proxyRes.statusCode}):`, req.url)
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
    
const serveCached = async (req, res) =>
    await serveCachedBinary(req, res) || await serveCachedSource(req, res)

const serveProxiedFile = async (req, res, target) => {
    if (await checkTarget(target, {allowRedirect: false})) {
        log.debug(`Proxying ${req.url} to ${target}`)
        proxy.web(req, res, {target})
        return true
    } else {
        log.debug(`Cannot proxy ${req.url} to ${target}`)
    }
    return false
}

const serveProxied = async (req, res) => {
    const packageInfo = getCranPackageInfo(req.url)
    const {base, name} = packageInfo
    return await serveProxiedFile(req, res, getCranTarget(base, name, {archive: false}))
        || await serveProxiedFile(req, res, getCranTarget(base, name, {archive: true}))
}

const serveCran = async (req, res) =>
    await serveCached(req, res) || await serveProxied(req, res) || await serveError(req, res)

module.exports = {serveCran}
