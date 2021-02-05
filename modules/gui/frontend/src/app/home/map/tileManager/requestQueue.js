import {ReplaySubject} from 'rxjs'
import {requestTag} from './tag'

export const getRequestQueue = () => {
    const pendingRequests = []
    const enqueued$ = new ReplaySubject()

    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        enqueued$.next(requestId)
        console.log(`Enqueued ${requestTag({tileProviderId, requestId})}`)
    }
    
    const pending = () => {
        const count = pendingRequests.length
        console.log(`Pending requests: ${count}`)
        return count > 0
    }
    
    const dequeue = () => {
        const pendingRequest = pendingRequests.shift()
        const {tileProviderId, requestId} = pendingRequest
        console.log(`Dequeued ${requestTag({tileProviderId, requestId})}`)
        return pendingRequest
    }
    
    const prioritize = () => {
        console.log('Prioritized requests (to be implemented)')
    }

    return {enqueue, pending, dequeue, prioritize, enqueued$}
}
