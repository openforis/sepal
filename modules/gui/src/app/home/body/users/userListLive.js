// Messages from the user module's ws: a pushed user updates the list in place. A ready that
// follows a lost connection means pushes were missed meanwhile, so the whole list is reloaded.
export const createUserWsHandler = ({onUser, onReconnect}) => {
    let connected = false
    let lost = false
    return ({ready, data}) => {
        if (data?.user) {
            onUser(data.user)
        }
        if (ready === true) {
            lost && onReconnect()
            connected = true
            lost = false
        } else if (ready === false) {
            lost = connected
        }
    }
}

// A row is an update only when its revision is past the shown one: the echo of the admin's own
// save, already applied from the response, is not. Rows are held back until the admin asks for
// them, latest per user.
export const newerRows = (shown, rows) => {
    const shownByUsername = byUsername(shown)
    return rows.filter(row => isNewer(shownByUsername[row.username], row))
}

const isNewer = (shown, row) =>
    !shown || row.revision > shown.revision

export const withPending = (pending, rows) =>
    ({...pending, ...byUsername(rows)})

// Writing rows into the list settles the pending ones they catch up with.
export const withoutStale = (pending, written) =>
    Object.fromEntries(
        Object.entries(pending).filter(([, row]) => !written.some(({username, revision}) => username === row.username && revision >= row.revision))
    )

// Known users replaced in place, unknown ones appended in the order given.
export const withRows = (users, rows) => {
    const rowsByUsername = byUsername(rows)
    const known = new Set(users.map(({username}) => username))
    return [
        ...users.map(user => rowsByUsername[user.username] ?? user),
        ...rows.filter(({username}) => !known.has(username))
    ]
}

const byUsername = rows =>
    Object.fromEntries(rows.map(row => [row.username, row]))

// A save rejected for a stale revision (409) comes back with the record as it is now; it is handled
// like a pushed change, so the admin sees what changed before retrying from it.
export const conflictingRecord = error =>
    error?.status === 409 ? error.response?.user : undefined
