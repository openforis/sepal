import {firstValueFrom} from 'rxjs'

import {setRequestUser, setSessionUsername} from './user.js'

// Logs the browser in as the user. A session held by another user is replaced before the username is stored, so it
// lands in the session the response hands out.
export const userSessionStarter = (userStore, ensureSessionFor) =>
    async (req, res, user) => {
        await firstValueFrom(userStore.setUser$(user))
        await ensureSessionFor(req, res, user.username)
        setSessionUsername(req, user.username)
        setRequestUser(req, user)
    }
