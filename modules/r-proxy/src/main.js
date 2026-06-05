import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer} from '#sepal/log'
configureServer(logConfig)

import {getLogger} from '#sepal/log'
const log = getLogger('main')
import {initProxy} from './proxy.js'
import {initQueue} from './queue.js'

const main = async () => {
    initProxy()
    await initQueue()
    log.info('Initialized')
}

main().catch(log.fatal)
