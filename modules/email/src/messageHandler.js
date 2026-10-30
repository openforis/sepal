import _ from 'lodash'

import {getLogger} from '#sepal/log'

import {setEmailNotificationsEnabled} from './cache.js'
import {enqueue} from './emailQueue.js'

const log = getLogger('messageHandler')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const handlers = {
    'email.sendToAddress': async (key, msg) => {
        const {from, to, cc, bcc, subject, content, contentType, forceEmailNotificationEnabled} = msg
        if ((to || cc || bcc) && (subject || content)) {
            await enqueue({from, to, cc, bcc, subject, content, contentType, forceEmailNotificationEnabled})
        } else {
            logError(key, msg)
        }
    },
    'email.sendToUser': async (key, msg) => {
        const {from, username, subject, content, contentType} = msg
        if (username && (subject || content)) {
            await enqueue({from, username, subject, content, contentType, forceEmailNotificationEnabled: true})
        } else {
            logError(key, msg)
        }
    },
    'user.UserUpdated': async (key, msg) => {
        const {email, emailNotificationsEnabled} = msg
        if (email) {
            await setEmailNotificationsEnabled(email, emailNotificationsEnabled)
        } else {
            logError(key, msg)
        }
    }
}

const messageHandler = async (key, msg) => {
    const handler = handlers[key]
    return handler && await handler(key, msg)
}

export {messageHandler}
