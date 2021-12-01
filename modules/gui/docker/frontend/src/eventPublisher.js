import {getLogger} from 'log'

const log = getLogger('eventPublisher')

export const publishEvent = (event, params) => {
    log.debug('Publishing event', {event, params})
    return window.gtag('event', event, params)
}

export const publishFatalError = error =>
    publishEvent('exception', {
        description: error,
        fatal: true
    })

export const publishError = error =>
    publishEvent('exception', {
        description: error,
        fatal: false
    })
