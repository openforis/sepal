// sessionOrdinals — the numbers a user knows their instances by.
//
// The ordinal is a session's 1-based position among that user's open SANDBOX sessions ordered by
// creation_time — exactly the list and ordering the SSH menu numbers (`interactive.js` prints
// `i + 1`, and the user types `1` to join or `1s` to stop). Naming an instance the same way in a
// notification, in the expiry email and on the email's management page means every interface
// agrees on which machine is being discussed.
//
// It is a SNAPSHOT: close an earlier session and the remaining ones renumber, here and in the SSH
// menu alike. That is inherent to a positional identifier, and the alternative — quoting a UUID at
// someone — is worse. It also means a description must be captured BEFORE anything closes.
//
// Shared by the expiry sweep and the management page so the two can never number differently.

import {SANDBOX} from '../../workerInstance/workerTypes.js'
import {State} from '../workerSession.js'

const sessionOrdinals = async (username, {repo}) => {
    const open = await repo.userSessions(username, [State.PENDING, State.ACTIVE], SANDBOX)
    return new Map(open.map(({id}, index) => [id, index + 1]))
}

export {sessionOrdinals}
