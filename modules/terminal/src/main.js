require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const express = require('express')
const expressWs = require('express-ws')
const Terminal = require('./terminal')
const {ip, port} = require('./config')

const app = express()
expressWs(app)

app.ws('/:sessionId', Terminal.start)
app.post('/:sessionId/size', Terminal.resize)

app.listen(port, ip)
log.info(`Terminal server listening to http://${ip}:${port}`)
