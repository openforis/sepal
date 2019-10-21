const ee = require('@google/earthengine')
const config = require('./config')
const express = require('express')

const {Worker} = require('worker_threads')

console.log(__dirname + '/worker.js')
const worker = new Worker('./src/worker.js')
worker.on('message', message => console.log(message))
worker.postMessage('ping')

const app = express()

// const send = ee.data.send_
// ee.data.send_ = (...args) => {
//     console.log('WRAPPED!')
//     return send(...args)
// }

const geeInit = callback =>
    ee.initialize(null, null, () =>
        callback()
    )

const geeServiceAccount = callback => {
    console.log('authenticating with service account')
    ee.data.authenticateViaPrivateKey(
        config.geeAuth,
        () => geeInit(callback)
    )
}

const geeUserAccount = (googleTokens, callback) => {
    console.log('authenticating with user account')
    const secondsToExpiration = (googleTokens.accessTokenExpiryDate - Date.now()) / 1000
    ee.data.setAuthToken(
        null,
        'Bearer',
        googleTokens.accessToken,
        secondsToExpiration,
        null,
        () => geeInit(callback),
        false
    )
}

const gee = (req, callback) => {
    const sepalUser = JSON.parse(req.headers['sepal-user'])
    const googleTokens = sepalUser.googleTokens
    return googleTokens
        ? geeUserAccount(googleTokens, callback)
        : geeServiceAccount(callback)
}

app.post('/preview', (req, res) => {
    gee(req, () => {
        const image = ee.Image(1)
        const map = image.getMap({})
        res.send({
            mapId: map.mapid,
            token: map.token
        })
    })
})

// app.get('/', () => console.log('GET'))
// app.post('/', () => console.log('POST'))

app.listen(config.port, () =>
    console.info(`Listening on port ${config.port}`)
)
