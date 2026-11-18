import {firstValueFrom} from 'rxjs'

import {removeRequestUser, setBrowserSessionUsername, setRequestUser} from './user.js'

// Logs the browser in as the user the cache holds once the authenticated one is offered to it: a newer identity
// there wins, and one that is no longer ACTIVE is not logged in. Until then the request carries no identity. A session
// held by another user is replaced before the username is stored, so it lands in the session the response hands out;
// that takes a session store round trip, during which a lock can land, so the user is read again afterwards. Answers
// the user logged in, or null.
export const userSessionStarter = (userStore, ensureSessionFor) =>
    async (req, res, authenticatedUser) => {
        removeRequestUser(req)
        const user = await firstValueFrom(userStore.setUser$(authenticatedUser))
        if (user.status !== 'ACTIVE') {
            return null
        }
        await ensureSessionFor(req, res, user.username)
        const current = await firstValueFrom(userStore.getUser$(user.username))
        if (current.status !== 'ACTIVE') {
            return null
        }
        setBrowserSessionUsername(req, current.username)
        setRequestUser(req, current)
        return current
    }
