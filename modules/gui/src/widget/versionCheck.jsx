import {useEffect} from 'react'
import {filter} from 'rxjs'

import {event$} from '~/api/ws'
import {useSubscriptions} from '~/subscription'
import {msg} from '~/translate'

import {Button} from './button'
import {Notifications} from './notifications'

export const VersionCheck = () => {
    const [addSubscription] = useSubscriptions()

    useEffect(() => {
        addSubscription(
            event$.pipe(
                filter(({type}) => type === 'clientVersionMismatch')
            ).subscribe(
                () => notify()
            )
        )
    }, [])

    const reload = () =>
        window.location.replace('/')

    const renderReloadButton = () => (
        <Button
            look={'add'}
            shape='pill'
            label={msg('home.versionMismatch.reloadNow')}
            width='max'
            onClick={reload}
        />
    )

    const notify = () =>
        Notifications.success({
            title: msg('home.versionMismatch.title'),
            message: msg('home.versionMismatch.message'),
            timeout: 0,
            group: true,
            content: renderReloadButton
        })

    return null
}
