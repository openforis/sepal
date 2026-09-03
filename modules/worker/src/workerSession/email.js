// email — worker's outbound-email shim (mirrors modules/user-storage/src/email.js):
// a Subject wired as the `email.sendToUser` publisher in main.js. The email module
// resolves the address and skips LOCKED users.

import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

import {userTag} from '../tag.js'

const log = getLogger('worker/email')

const email$ = new Subject()

const sendEmail = ({username, subject, content}) => {
    log.debug(`Enqueuing email to ${userTag(username)}`)
    email$.next({from: 'worker', username, subject, content})
}

export {email$, sendEmail}
