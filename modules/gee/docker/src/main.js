const config = require('./config')
const express = require('express')
const gee = require('./gee/gee')

const app = express()

app.post('/preview', (req, res) => {
    gee(req, 'preview', [123], result => res.send(result))
})

app.get('/test', (req, res) => {
    gee(req, 'test', [123], result => res.send(result))
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

// const rateLimit = require('./rateLimit')
// const {of} = require('rxjs')

// of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10).pipe(
//     rateLimit(3, 1000)
// ).subscribe(console.log)
