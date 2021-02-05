import {requestTag} from './tag'

const pendingRequests = []

export const enqueue = ({tileProviderId, requestId, request, response$, cancel$, enqueued$}) => {
    pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
    enqueued$.next(requestId)
    console.log(`Enqueued ${requestTag({tileProviderId, requestId})}`)
}

export const pending = () => {
    const count = pendingRequests.length
    console.log(`Pending requests: ${count}`)
    return count > 0
}

export const dequeue = () => {
    const pendingRequest = pendingRequests.shift()
    const {tileProviderId, requestId} = pendingRequest
    console.log(`Dequeued ${requestTag({tileProviderId, requestId})}`)
    return pendingRequest
}

export const prioritize = () => {
    console.log('Prioritized requests (to be implemented)')
}
