import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

const log = getLogger('email')

// Published as email.sendToUser once the message queue is up (main.js).
export const email$ = new Subject()

export const sendEmail = ({username, subject, content}) => {
    log.debug(`Enqueuing email to user ${username}`)
    email$.next({from: 'user-files', username, subject, content})
}
