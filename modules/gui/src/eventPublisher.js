import {getLanguage} from '~/translate'
import {getLogger} from '~/log'

const log = getLogger('eventPublisher')

export const publishCurrentUserEvent = user => {
    const {admin, organization, googleTokens = null} = user || {}
    const language = getLanguage()
    const props = user
        ? {
            admin: `${!!admin}`,
            organization,
            google_account: `${!!googleTokens}`,
            language
        }
        : {
            admin: undefined,
            organization: undefined,
            google_account: undefined,
            language
        }
    log.debug('Publishing current user event', {props})
    window.gtag('set', 'user_properties', props)
}

export const publishEvent = (event, props) => {
    log.debug('Publishing event', {event, props})
    return window.gtag('event', event, props)
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
