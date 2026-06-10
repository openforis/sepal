import {firstValueFrom, map} from 'rxjs'

import {get$} from '#sepal/httpClient'
import {getLogger} from '#sepal/log'

import {gatewayHost, sepalPassword, sepalUsername} from './config.js'

const log = getLogger('http/server')

const getEmailNotificationsEnabled = async emailAddress => {
    log.debug(() => `Getting email notifications preference for address <${emailAddress}> from origin`)
    const response = await firstValueFrom(
        get$(`http://${gatewayHost}/api/user/email-notifications-enabled/${emailAddress}`, {
            username: sepalUsername,
            password: sepalPassword
        })
    )

    const json = JSON.parse(response.body)
    return json.emailNotificationsEnabled
}

const getUser = async username => {
    log.debug(() => `Getting email address for user <${username}> from origin`)
    return firstValueFrom(
        get$(`http://${gatewayHost}/api/user/info`, {
            username: sepalUsername,
            password: sepalPassword,
            query: {
                username
            }
        }).pipe(
            map(({body}) => body ? JSON.parse(body) : {})
        )
    )
}

export {getEmailNotificationsEnabled, getUser}
