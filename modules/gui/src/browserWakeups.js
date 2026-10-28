import {EMPTY, filter, fromEvent, merge} from 'rxjs'

// When the browser comes back to the user: the page becoming visible, or the network reconnecting.
export const browserWakeups$ = () => typeof document === 'undefined' || typeof window === 'undefined'
    ? EMPTY
    : merge(
        fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible')),
        fromEvent(window, 'online')
    )

export const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
