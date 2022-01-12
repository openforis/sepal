const log = require('sepal/log').getLogger('proxy')
const http = require('http')
const https = require('https')
const httpProxy = require('http-proxy')
const fs = require('fs')
const {mkdir, stat} = require('fs/promises')
const path = require('path')
const {httpPort} = require('./config')
const {getTmpPath, getRepoPath, getPackageInfo, toBinaryPackagePath, getTarget} = require('./filesystem')
const {enqueueBuildBinaryPackage} = require('./queue')

const buildBinaryPackage = requestPath => {
    const packageInfo = getPackageInfo(requestPath)
    if (packageInfo) {
        const {name, version} = packageInfo
        if (name !== 'PACKAGES') {
            enqueueBuildBinaryPackage(name, version, `http://localhost:${httpPort}`)
        } else {
            log.debug(`Skipping ${name}`)
        }
    }
}

const initProxy = () => {
    const proxy = httpProxy.createProxyServer()

    proxy.on('proxyRes', (proxyRes, req, res, _options) => {
        const requestPath = req.url
        const tmpPath = getTmpPath(requestPath)
        const repoPath = getRepoPath(requestPath)
        const repoDir = path.dirname(repoPath)
        const {name} = getPackageInfo(requestPath)
        if (proxyRes.statusCode === 200) {
            mkdir(repoDir, {recursive: true})
                .then(() => {
                    if (name !== 'PACKAGES') {
                        const stream = fs.createWriteStream(tmpPath)
                        stream.on('finish', () => {
                            log.debug('Moving to:', repoPath)
                            fs.renameSync(tmpPath, repoPath)
                            buildBinaryPackage(requestPath)
                            log.debug('Proxied:', req.url)
                        })
                        log.debug('Saving to:', tmpPath)
                        proxyRes.pipe(stream)
                    } else {
                        log.debug('')
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
        res.end('Something went wrong. And we are reporting a custom error message.')
    })
    
    const serveCachedFile = async ({res, requestPath, type}) => {
        try {
            const repoPath = getRepoPath(requestPath)
            try {
                const requestStat = await stat(repoPath)
                if (requestStat.isFile()) {
                    log.debug(`Serving ${type}:`, repoPath)
                    fs.createReadStream(repoPath).pipe(res)
                    return true
                }
            } catch (error) {
                return false
            }
            return false
        } catch (error) {
            log.warn('Cannot serve cached file', error)
            return false
        }
    }

    const serveCachedBinary = async (req, res) =>
        await serveCachedFile({res, requestPath: toBinaryPackagePath(req.url), type: 'binary'})

    const serveCachedSource = async (req, res) =>
        await serveCachedFile({res, requestPath: req.url, type: 'source'})
    
    const serveCached = async (req, res) =>
        await serveCachedBinary(req, res) || await serveCachedSource(req, res)

    const checkTarget = url =>
        new Promise((resolve, reject) => {
            try {
                const request = https.request(url, {
                    method: 'HEAD'
                }, res => resolve(res.statusCode === 200))
                request.end()
            } catch (error) {
                reject(error)
            }
        })

    const serveProxiedFile = async (req, res, target) => {
        if (await checkTarget(target)) {
            log.debug(`Proxying ${req.url} to ${target}`)
            proxy.web(req, res, {
                target,
                secure: false,
                changeOrigin: true,
                ignorePath: true,
                selfHandleResponse: true
            })
            return true
        } else {
            log.debug(`Cannot proxy (404) ${req.url} to ${target}`, )
        }
        return false
    }

    const serveProxied = async (req, res) => {
        const packageInfo = getPackageInfo(req.url)
        const {base, name} = packageInfo
        return await serveProxiedFile(req, res, getTarget(base, name, {archive: false}))
            || await serveProxiedFile(req, res, getTarget(base, name, {archive: true}))
    }

    const serveError = async (req, res) => {
        log.debug('Cannot serve:', req.url)
        res.end()
    }

    const handleRequest = async (req, res) =>
        await serveCached(req, res) || await serveProxied(req, res) || await serveError(req, res)

    if (httpPort) {
        http.createServer((req, res) => {
            handleRequest(req, res)
                .catch(error => log.error(error))
        }).listen(httpPort)
        log.info(`Listening on port ${httpPort}`)
    } else {
        log.fatal('No listening port configured.')
    }
}

module.exports = {initProxy}
