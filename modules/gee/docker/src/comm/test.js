const {MessageChannel} = require('worker_threads')
const {finalize} = require('rxjs/operators')
const log = require('../log')

const vector = require('./vector')
const channel = require('./channel')

const {port1, port2} = new MessageChannel()

// side 1 (TX)

const {in$} = channel(vector({name: 'TX', port: port1}), 1)

in$.next('test 1.1 value 1')
in$.next('test 1.1 value 2')
// in$.complete()

// side 2 (RX)

const {out$} = channel(vector({name: 'RX', port: port2}), 1)

const subscription = out$.pipe(
    finalize(() => 'out 2 finalized')
).subscribe({
    next: value => log.info('out2 value:', value),
    error: error => log.error('out2 error:', error),
    complete: () => log.info('out2 complete'),
})

setTimeout(() => subscription.unsubscribe(), 1000)
