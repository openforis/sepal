const {Worker, MessageChannel} = require('worker_threads')
const path = require('path')
const _ = require('lodash')

const rateLimiter = require('./rateLimiter')

const ROOT_PATH = path.dirname(require.main.filename)
const WORKER_PATH = path.join(__dirname, 'worker.js')

const createPorts = names =>
    _.transform(names, (data, name) => {
        const {port1: localPort, port2: remotePort} = new MessageChannel()
        data.localPorts[name] = localPort
        data.remotePorts[name] = remotePort
    }, {
        localPorts: {},
        remotePorts: {}
    })

const bootstrapWorker = ({worker, ports, callback}) =>
    worker
        .once('message', status => {
            if (status === 'READY') {
                callback(worker, ports.localPorts)
            } else {
                console.error('Worker not ready.')
            }
        })
        .postMessage(ports.remotePorts, _.values(ports.remotePorts))

const setupWorker = (portNames, callback) => {
    bootstrapWorker({
        worker: new Worker(WORKER_PATH),
        ports: createPorts(portNames),
        callback
    })
}

const submit = (message, callback) =>
    setupWorker(['job', 'rateLimit'], (worker, {job, rateLimit}) => {
        const subscription = rateLimiter(rateLimit)
        job.once('message', message => {
            callback(message)
            worker.unref() // is this correct? terminate() probably isn't...
            subscription.cleanup()
        })
        job.postMessage(message)

    })

module.exports = ({auth, relativePath, args}, callback) =>
    submit({
        auth,
        job: {
            modulePath: path.join(ROOT_PATH, relativePath),
            args,
        }
    }, callback)
