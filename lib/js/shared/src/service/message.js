const _ = require('lodash')
const {Subject, first, of} = require('rxjs')
const service = require('#sepal/service')
const {v4: uuid} = require('uuid')

const MessageService = (serviceName = uuid()) => {
    const message$ = new Subject()

    const messageService = {
        serviceName,
        serviceHandler$: msg => {
            message$.next(msg)
            return of(true) // serviceHandler$ must emit for proper cleanup
        }
    }

    return {
        message$,
        messageService,
        sendMessage$: msg => service.submit$(messageService, msg).pipe(first())
    }
}

module.exports = {MessageService}
