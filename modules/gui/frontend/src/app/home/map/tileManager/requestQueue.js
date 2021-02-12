import {requestTag} from './tag'
import _ from 'lodash'

export const getRequestQueue = () => {
    const pendingRequests = []

    const getCount = () => {
        return pendingRequests.length
    }
    
    const isEmpty = () => {
        return getCount() === 0
    }
    
    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        console.log(`Enqueued ${requestTag({tileProviderId, requestId})}, pending: ${getCount()}`)
    }

    const dequeueOldest = () => {
        return pendingRequests.shift()
    }

    const dequeueByRequestId = requestId => {
        if (requestId) {
            const index = _.findIndex(pendingRequests, pendingRequest => pendingRequest.requestId === requestId)
            if (index !== -1) {
                const [pendingRequest] = pendingRequests.splice(index, 1)
                return pendingRequest
            } else {
                console.warn(`Could not dequeue ${requestTag({requestId})}`)
            }
        }
        return null
    }

    const dequeue = dequeueRequestId => {
        const pendingRequest = dequeueByRequestId(dequeueRequestId) || dequeueOldest()
        const {tileProviderId, requestId} = pendingRequest
        console.log(`Dequeued ${requestTag({tileProviderId, requestId})}, pending: ${getCount()}`)
        return pendingRequest
    }

    return {isEmpty, enqueue, dequeue}
}
