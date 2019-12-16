const {MessageChannel} = require('worker_threads')
// const log = require('../log')

const Transport = require('./transport')

const {port1, port2} = new MessageChannel()

// Master side

// const {in$, out$} = transport({id: 'master', port: port1}).createChannel('foo')
// const subscription = out$.subscribe()
// in$.next('test 1.1 value 1')
// in$.complete()
// setTimeout(() => subscription.unsubscribe(), 2000)

const masterTransport = Transport({id: 'master', port: port1})

const {in$, out$} = masterTransport.createChannel('foo')
const subscription = out$.subscribe()
in$.next('value 1')

setTimeout(() => subscription.unsubscribe(), 1000)

// Slave side

Transport({id: 'slave', port: port2,
    onChannel: ({in$, out$}) => {
        const subscription = out$.subscribe()
        in$.next('Hello!')
        // in$.complete()
        setTimeout(() => subscription.unsubscribe(), 2000)
    }
})
