import {useEffect} from 'react'
import {filter} from 'rxjs'

import {event$} from '~/api/ws'
import {useSubscriptions} from '~/subscription'

// The gateway tells the tabs of a destroyed login session (logout elsewhere, a password reset,
// an admin lock) and closes their socket. A full reload lands the tab wherever the browser's
// current cookie says: the landing page, or the account that has since logged in.
export const LoginSessionMonitor = () => {
    const [addSubscriptions] = useSubscriptions()

    useEffect(() => {
        addSubscriptions(
            event$.pipe(
                filter(({type}) => type === 'loginSessionInvalidated')
            ).subscribe(
                () => window.location.replace('/')
            )
        )
    }, [addSubscriptions])

    return null
}
