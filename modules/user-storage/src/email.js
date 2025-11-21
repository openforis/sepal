const {Subject} = require('rxjs')
const log = require('#sepal/log').getLogger('email')

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

module.exports = {email$, sendEmail}
