import http from 'http'

import {getLogger} from '#sepal/log'

import {httpPort} from './config.js'
import {serveCran} from './proxy-cran.js'
import {serveGitHub} from './proxy-github.js'

const log = getLogger('proxy')

const handleRequest = async (req, res) => {
    try {
        req.url.startsWith('/github/')
            ? await serveGitHub(req, res)
            : await serveCran(req, res)
    } catch (error) {
        log.error(error)
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
