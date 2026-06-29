import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'

import {invalidateIncompatiblePackages} from './abiCheck.js'
import {initProxy} from './proxy.js'
import {initQueue} from './queue.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await invalidateIncompatiblePackages()
    await initQueue()
    initProxy()
    log.info('Initialized')
}

main().catch(log.fatal)
