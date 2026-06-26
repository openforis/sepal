import {useEffect} from 'react'
import {Subject, throttleTime} from 'rxjs'

import {actionBuilder} from '~/action-builder'

const updateDimensions = () => {
    const width = window.innerWidth
    const height = window.innerHeight
    actionBuilder('SET_APP_DIMENSIONS')
        .set('dimensions', {width, height})
        .dispatch()
}

export const ViewportResizeSensor = () => {
    useEffect(() => {
        const viewportResize$ = new Subject()
        updateDimensions()
        const onResize = () => viewportResize$.next()
        window.addEventListener('resize', onResize)
        const subscription = viewportResize$.pipe(
            throttleTime(100, null, {leading: true, trailing: true})
        ).subscribe({
            next: () => updateDimensions()
        })
        return () => {
            window.removeEventListener('resize', onResize)
            subscription.unsubscribe()
        }
    }, [])
}

ViewportResizeSensor.propTypes = {}
