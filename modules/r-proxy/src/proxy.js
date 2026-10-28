import http from 'node:http'

import {getLogger} from '#sepal/log'

import {httpPort} from './config.js'
import {serveCran} from './proxy-cran.js'
import {serveGitHub} from './proxy-github.js'
import {serveFailure} from './proxy-utils.js'

const log = getLogger('proxy')

const handleRequest = async (req, res) => {
    try {
        req.url.startsWith('/github/')
            ? await serveGitHub(req, res)
            : await serveCran(req, res)
    } catch (error) {
        log.error('Failed to handle request:', req.url, error)
        serveFailure(res)
    }
}

const initProxy = () => {
    if (httpPort) {
        http.createServer(handleRequest).listen(httpPort)
        log.info(`Listening on port ${httpPort}`)
    } else {
        log.fatal('No listening port configured.')
    }
}

export {initProxy}
