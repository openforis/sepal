import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {Access} from './access.js'
import {Attachments} from './attachments.js'
import {port, s3, sepalHost} from './config.js'
import {Providers} from './providers/providers.js'
import {createS3Provider} from './providers/s3.js'
import {createRoutes} from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const access = new Access({
        attachments: new Attachments({bucket: s3.bucket}),
        providers: new Providers({s3: createS3Provider(s3)}),
        sepalHost
    })
    await server.start({port, routes: createRoutes(access)})
    log.info('Initialized')
}

main().catch(log.fatal)
