// changed.js — in-process change feed from the REST mutation handlers to the ws push layer
// (see ws.js). Emissions:
//   {}           — the message set changed; every user's list is affected
//   {username}   — that user's read state changed; affects their list and every admin's, whose
//                  lists carry the per-message acknowledged count
import {Subject} from 'rxjs'

const messageChanged$ = new Subject()

const publishMessagesChanged = () =>
    messageChanged$.next({})

const publishReadStateChanged = username =>
    messageChanged$.next({username})

export {messageChanged$, publishMessagesChanged, publishReadStateChanged}
