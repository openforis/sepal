const config = require('./config')
const express = require('express')
const job = require('./job')
const gee = require('./gee')

const app = express()

app.get('/test', (req, res) => {
    job.submit({relativePath: 'test', args: [123]}, result => res.send(result))
})

app.post('/preview', (req, res) => {
    gee.submit(req, 'preview', [123], result => res.send(result))
})

app.get('*', (req, res) => {
    console.log('GET', req.url)
    res.send({status: 'OK'})
})

app.post('*', (req, _res) => {
    console.log('POST', req.url)
})

app.listen(config.port, () =>
    console.info(`Listening on port ${config.port}`)
)
