const express = require('express')
const expressWs = require('express-ws')

const Terminal = require('./terminal')
const {HOST, PORT} = require('./config')

const app = express()
expressWs(app)

app.ws('/:sessionId', Terminal.start)
app.post('/:sessionId/size', Terminal.resize)

app.listen(PORT, HOST)
console.log(`Terminal server listening to http://${HOST}:${PORT}`)
