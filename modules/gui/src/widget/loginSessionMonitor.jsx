import {useEffect} from 'react'
import {filter} from 'rxjs'

import {event$} from '~/api/ws'
import {notePreviousUsername, takePreviousUsername} from '~/loginSession'
import {useSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {currentUser} from '~/user'

import {Notifications} from './notifications'

// The gateway tells the tabs of a replaced or destroyed login session (a password reset in another
// tab, a logout, an admin lock) and closes their socket. A full reload lands the tab wherever the
// browser's current cookie says. Only when another user logged in on the session is the account
// switch worth telling; after a logout the tab must come back silently, whoever logs in next.
export const LoginSessionMonitor = () => {
    const [addSubscriptions] = useSubscriptions()

    useEffect(() => {
        notifyIfSwitchedAccount()
        addSubscriptions(
            event$.pipe(
                filter(({type}) => type === 'loginSessionInvalidated')
            ).subscribe(
                ({data}) => reload(data?.reason === 'replaced')
            )
        )
    }, [addSubscriptions])

    return null
}

const reload = replaced => {
    if (replaced) {
        notePreviousUsername(currentUser()?.username)
    }
    window.location.replace('/')
}

const notifyIfSwitchedAccount = () => {
    const previousUsername = takePreviousUsername()
    if (previousUsername) {
        const {username} = currentUser()
        if (username !== previousUsername) {
            // A fixed id: a later switch replaces the message instead of stacking another.
            Notifications.info({
                id: 'loginSession.switched',
                message: msg('home.loginSession.switched', {username}),
                timeout: 0
            })
        }
    }
}
