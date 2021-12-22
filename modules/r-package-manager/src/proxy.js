const log = require('sepal/log').getLogger('proxy')
const https = require('https')
const httpProxy = require('http-proxy')
const fs = require('fs')
const {mkdir, stat} = require('fs/promises')
const path = require('path')
const {port, cranRepo} = require('./config')
const {getRepoPath} = require('./filesystem')

// openssl genrsa -out key.pem
// openssl req -new -key key.pem -out csr.pem
// openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
// rm csr.pem

const init = () => {
    const proxy = httpProxy.createProxyServer({})

    proxy.on('proxyRes', (proxyRes, req, _res, _options) => {
        const requestPath = getRepoPath(req.url)
        const requestDir = path.dirname(requestPath)
        // save successfully proxied requests to local cache
        if (proxyRes.statusCode === 200) {
            mkdir(requestDir, {recursive: true}).then(() => {
                log.debug('Successful proxy request:', req.url)
                proxyRes.pipe(fs.createWriteStream(requestPath))
                enqueueBinaryBuild(req.url)
            })
        } else {
            log.debug(`Failed proxy request (${proxyRes.statusCode}):`, req.url)
        }
    })

    proxy.on('error', function (err, req, res) {
        log.warn('proxy error')
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        })
        res.end('Something went wrong. And we are reporting a custom error message.')
    })
    
    const options = {
        key: fs.readFileSync('src/ssl/key.pem'),
        cert: fs.readFileSync('src/ssl/cert.pem')
    }

    const enqueueMakeBinaryPackage = async requestUrl => {
        log.debug('Enqueuing binary build:', requestUrl)
    }

    const serveCachedFile = async (req, res, requestPath) => {
        try {
            const repoPath = getRepoPath(requestPath)
            try {
                const requestStat = await stat(repoPath)
                if (requestStat.isFile()) {
                    log.debug('Serving request from cache:', repoPath)
                    fs.createReadStream(repoPath).pipe(res)
                    return true
                }
            } catch (error) {
                return false
            }
            return false
        } catch (error) {
            log.warn(error)
            return false
        }
    }

    const serveCachedBinary = async (req, res) =>
        await serveCachedFile(req, res, req.url.replace(/^\/src\//, '/bin/'))

    const serveCachedSource = async (req, res) =>
        await serveCachedFile(req, res, req.url)
    
    const serveCached = async (req, res) =>
        await serveCachedBinary(req, res) || await serveCachedSource(req, res)

    const serveProxied = async (req, res) => {
        log.debug('Proxying request:', req.url)
        proxy.web(req, res, {
            target: cranRepo,
            secure: false,
            changeOrigin: true
        })
    }

    const handleLocalRequest = async (req, res) =>
        await serveCached(req, res) || await serveProxied(req, res)

    const server = https.createServer(options, (req, res) => {
        handleLocalRequest(req, res)
            .catch(error => log.error(error))
    })
      
    server.listen(port)
    log.info(`Listening on port ${port}`)
}

module.exports = {init}
