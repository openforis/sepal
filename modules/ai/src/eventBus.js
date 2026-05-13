const {Subject} = require('rxjs')

function createEventBus() {
    const subject = new Subject()
    return {
        publish: event => subject.next(event),
        events$: subject.asObservable()
    }
}

module.exports = {createEventBus}
