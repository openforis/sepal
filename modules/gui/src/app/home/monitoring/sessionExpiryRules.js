// staleWarnings — which expiry warnings currently on screen no longer describe reality.
//
// Kept in its own module with no imports so it can be tested directly: the monitor itself reaches
// the websocket layer at import time, which needs a browser.
//
// The design's promise is that ANY extension cancels the expiry cycle, including the common case
// where nobody touches the notification at all and simply goes back to typing. The ratchet already
// resets notification_state to NONE and the session ws already pushes the new report, so the
// warning has a source of truth telling it to go — it just has to listen.
//
// A session that has vanished from the report counts too: stopped by hand, or closed by anything
// else. Leaving a warning up for an instance that no longer exists offers buttons that can only
// fail.
//
// DISMISSED is deliberately NOT stale: the user pressed Dismiss, the toast is already gone by their
// own click, and the session is still on its way to closing.
export const staleWarnings = (openIds, sessions) =>
    [...openIds].filter(sessionId => {
        const session = (sessions || []).find(({id}) => id === sessionId)
        return !session || session.expiry?.state === 'NONE'
    })
