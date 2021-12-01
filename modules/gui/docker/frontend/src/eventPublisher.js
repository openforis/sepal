import {getLogger} from 'log'

const log = getLogger('eventPublisher')

export const publishCurrentUserEvent = user => {
    const {admin, organization, googleTokens = null} = user || {}
    const params = {
        admin: `${!!admin}`,
        organization,
        google_account: user ? `${!!googleTokens}` : undefined
    }
    log.debug('Publishing current user event', {params})
    window.gtag('set', 'user_properties', params)
}

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
