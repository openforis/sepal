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
        window.onresize = () => viewportResize$.next()
        const subscription = viewportResize$.pipe(
            throttleTime(100, null, {leading: true, trailing: true})
        ).subscribe({
            next: () => updateDimensions()
        })
        return () => {
            subscription.unsubscribe()
        }
    }, [])
}

ViewportResizeSensor.propTypes = {}
