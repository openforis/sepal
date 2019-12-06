const {MessageChannel} = require('worker_threads')
const channel = require('./channel')
const subchannel = require('./subchannel')

const {port1, port2} = new MessageChannel()

// side 1

const channel1 = channel(port1)
const {in$: in11$, out$: out11$} = subchannel(channel1, 1)
const {in$: in12$, out$: out12$} = subchannel(channel1, 2)

out11$.subscribe({
    next: value => console.log('out1.1 value:', value),
    error: error => console.error('out1.1 error:', error),
    complete: () => console.info('out1.1 complete'),
})
in11$.next('Test 1.1')
in11$.complete()

out12$.subscribe({
    next: value => console.log('out1.2 value:', value),
    error: error => console.error('out1.2 error:', error),
    complete: () => console.info('out1.2 complete'),
})
in12$.next('Test 1.2')
in12$.complete()

// side 2

const channel2 = channel(port2)
const {in$: in21$, out$: out21$} = subchannel(channel2, 1)
const {in$: in22$, out$: out22$} = subchannel(channel2, 2)

out21$.subscribe({
    next: value => console.log('out2.1 value:', value),
    error: error => console.error('out2.1 error:', error),
    complete: () => console.info('out2.1 complete'),
})
in21$.next('Test 2.1')
in21$.error('Test 2.1 error')

out22$.subscribe({
    next: value => console.log('out2.2 value:', value),
    error: error => console.error('out2.2 error:', error),
    complete: () => console.info('out2.2 complete'),
})
in22$.next('Test 2.2')
in22$.error('Test 2.2 error')
