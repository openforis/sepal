const {parentPort} = require('worker_threads')

parentPort.once('message', message => parentPort.postMessage({pong: message}))
