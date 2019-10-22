const {Worker, MessageChannel} = require('worker_threads')
const path = require('path')

const config = require('../config')

const rootPath = path.dirname(require.main.filename)

const subChannel = new MessageChannel()

const submit = ({sepalUser, serviceAccountCredentials, modulePath, args, callback}) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'))
    const localJobPort = subChannel.port1
    const remoteJobPort = subChannel.port2
    worker.postMessage({jobPort: remoteJobPort}, [remoteJobPort])
    localJobPort.once('message', message => {
        worker.terminate()
        callback(message)
    })
    localJobPort.postMessage({sepalUser, serviceAccountCredentials, modulePath, args})
}

module.exports = (req, relativePath, args, callback) => {
    const sepalUser = JSON.parse(req.headers['sepal-user'])
    const serviceAccountCredentials = config.serviceAccountCredentials
    const modulePath = path.join(rootPath, relativePath)
    submit({sepalUser, serviceAccountCredentials, modulePath, args, callback})
}
