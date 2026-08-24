// changed.js — in-process change feed from the REST mutation handlers to the ws push layer
// (see ws.js). Emissions:
//   {}           — the message set or any read state changed; every user's list is affected
//                  (read-state changes broadcast too, because they move the per-message
//                  acknowledged count every subscriber displays)
//   {username}   — supported by the ws layer for user-scoped changes; currently unused
import {Subject} from 'rxjs'

const messageChanged$ = new Subject()

const publishMessagesChanged = () =>
    messageChanged$.next({})

export {messageChanged$, publishMessagesChanged}
