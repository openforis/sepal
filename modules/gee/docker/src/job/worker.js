const {parentPort} = require('worker_threads')

const exported = {}

const authenticate = ({modulePath, args}, callback) => {
    const func = require(modulePath)
    func(args, () =>
        callback()
    )
}

const execute = ({modulePath, args}, port) => {
    const onError = error => {
        console.log(`Job error: ${error}`)
        port.postMessage({error})
    }
    const onComplete = message => {
        console.log(`Job complete: ${message}`)
        port.postMessage({message})
    }
    const func = require(modulePath)
    func(...args, onError, onComplete)
}

parentPort.once('message', ports => {
    exported.ports = ports
    const port = ports.job
    port.once('message', ({auth, job}) => {
        if (auth) {
            authenticate(auth, () =>
                execute(job, port)
            )
        } else {
            execute(job, port)
        }
    })
    parentPort.postMessage('READY')
})

module.exports = exported
