import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

const log = getLogger('email')

const email$ = new Subject()

const sendEmail = async ({username, subject, content}) => {
    log.debug(`Enqueuing email to user ${username}`)
    email$.next({
        from: 'user-storage',
        username,
        subject,
        content
    })
}

export {email$, sendEmail}
