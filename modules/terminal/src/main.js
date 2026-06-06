import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer} from '#sepal/log'
configureServer(logConfig)

import {getLogger} from '#sepal/log'
const log = getLogger('main')

import express from 'express'
import expressWs from 'express-ws'

import {ip, port} from './config.js'
import * as Terminal from './terminal.js'

const app = express()
expressWs(app)

app.ws('/:sessionId', Terminal.start)
app.post('/:sessionId/size', Terminal.resize)

app.listen(port, ip)
log.info(`Terminal server listening to http://${ip}:${port}`)
