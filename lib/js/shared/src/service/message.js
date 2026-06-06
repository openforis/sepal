import _ from 'lodash'
import {first, of, Subject} from 'rxjs'
import {v4 as uuid} from 'uuid'

import * as service from '#sepal/service'

const MessageService = (serviceName = uuid()) => {
    const message$ = new Subject()

    const messageService = {
        serviceName,
        serviceHandler$: msg => {
            message$.next(msg)
            return of(true) // serviceHandler$ must emit for proper cleanup
        }
    }

    return {
        message$,
        messageService,
        sendMessage$: msg => service.submit$(messageService, msg).pipe(first())
    }
}

export {MessageService}
