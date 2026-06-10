import logConfig from '#config/log.json' with {type: 'json'}
import * as log from '#sepal/log'

import {createApp} from './app.js'
import * as config from './config.js'

log.configureServer(logConfig)

const logger = log.getLogger('main')

createApp({config}).start().catch(error => {
    logger.fatal(error)
    process.exit(1)
})
