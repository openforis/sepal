const {sepalHost, sepalUsername, sepalPassword} = require('./config')
const {get$} = require('#sepal/httpClient')
const {firstValueFrom} = require('rxjs')
const log = require('#sepal/log').getLogger('http')

const getEmailNotificationsEnabled = async emailAddress => {
    log.debug(() => `Getting email notifications preference for address <${emailAddress}> from origin`)
    const response = await firstValueFrom(
        get$(`https://${sepalHost}/api/user/email-notifications-enabled/${emailAddress}`, {
            username: sepalUsername,
            password: sepalPassword
        })
    )

    const json = JSON.parse(response.body)
    return json.emailNotificationsEnabled
}

module.exports = {getEmailNotificationsEnabled}
