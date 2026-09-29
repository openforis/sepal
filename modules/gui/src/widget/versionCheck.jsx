import {useEffect} from 'react'
import {filter} from 'rxjs'

import {event$} from '~/api/ws'
import {useSubscriptions} from '~/subscription'
import {msg} from '~/translate'

import {Notifications} from './notifications'

export const VersionCheck = () => {
    const [addSubscriptions] = useSubscriptions()

    useEffect(() => {
        addSubscriptions(
            event$.pipe(
                filter(({type}) => type === 'clientVersionMismatch')
            ).subscribe(
                () => notify()
            )
        )
    }, [addSubscriptions])

    const notify = () =>
        Notifications.success({
            title: msg('home.versionMismatch.title'),
            message: msg('home.versionMismatch.message'),
            timeout: 0,
            group: true
        })

    return null
}
