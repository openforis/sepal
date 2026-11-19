import {Subject} from 'rxjs'

// Whether the user button draws attention to the user's details: raised by what finds the account needs the user -
// the session service (user.js), the Google-account monitor, the Apps list - and withdrawn the same way. The user
// button shows what is sent while it is mounted; nothing is kept or replayed.
const hint$ = new Subject()

export const userDetailsHint = visible =>
    hint$.next(visible)

export const userDetailsHint$ = hint$.asObservable()
