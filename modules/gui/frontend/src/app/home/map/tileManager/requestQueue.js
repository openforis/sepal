import {ReplaySubject} from 'rxjs'
import {requestTag} from './tag'

export const getRequestQueue = () => {
    const pendingRequests = []
    const enqueued$ = new ReplaySubject()

    const count = () => {
        return pendingRequests.length
    }
    
    const pending = () => {
        return count() > 0
    }
    
    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        enqueued$.next(requestId)
        console.log(`Enqueued ${requestTag({tileProviderId, requestId})}, pending: ${count()}`)
    }

    const dequeue = () => {
        const pendingRequest = pendingRequests.shift()
        const {tileProviderId, requestId} = pendingRequest
        console.log(`Dequeued ${requestTag({tileProviderId, requestId})}, pending: ${count()}`)
        return pendingRequest
    }
    
    const prioritize = () => {
        console.log('Prioritized requests (to be implemented)')
    }

    return {enqueue, pending, dequeue, prioritize, enqueued$}
}
