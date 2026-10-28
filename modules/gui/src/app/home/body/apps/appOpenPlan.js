// appOpenPlan — pure decision logic for opening a sandbox app under client-scoped app
// ownership.
//
// An app may be live-associated with one instance (its open tab, here or in another
// browser). The app's ENDPOINT is its group: all apps of one endpoint (e.g. every
// jupyter app — Lab, Notebook, voila apps) may run side by side but MUST share one
// instance. Opening an app therefore resolves to one of:
//   focus   — the app's own tab is open in THIS browser and the same instance was picked
//   open    — no conflicts, or a silent same-instance group join
//   confirm — something must close first, for one of three reasons:
//               otherBrowser  — the app is open in another browser, on the picked instance
//               otherInstance — the app is open on another instance (here or elsewhere)
//               group         — only group-mates conflict: they sit on another instance
// Docker (non-sandbox) apps never get here: they run as isolated per-copy containers,
// unrestricted.

// groupApps — the app plus the catalog apps sharing its endpoint (its group). The app
// itself is always included, even when the catalog is not loaded yet.
export const groupApps = (app, apps) =>
    app?.endpoint
        ? [app, ...(apps || []).filter(other => other.endpoint === app.endpoint && other.path !== app.path)]
        : [app]

// conflictingAssociations — live associations (from the report's sessions[].apps) of the
// app itself or a group-mate: [{path, label, sessionId}]. These exist only while a tab is
// open somewhere (tab close and clientDown both release the association).
export const conflictingAssociations = (app, apps, sessions) => {
    const paths = new Set(groupApps(app, apps).map(({path}) => path))
    return (sessions || []).flatMap(session =>
        (session.apps || [])
            .filter(({path}) => paths.has(path))
            .map(({path, label}) => ({path, label, sessionId: session.id}))
    )
}

// openPlan — decide what opening `app` on the picked `selection` means.
//   app        — the catalog app being opened
//   selection  — the instance-picker choice: {sessionId} (join) or {instanceType} (new)
//   conflicts  — conflictingAssociations(...) at decision time
//   tabs       — this browser's apps.tabs
// Returns:
//   {action: 'open'}
//   {action: 'focus', tabId}
//   {action: 'confirm', reason, sessionId, toRelease: [path], toCloseLocal: [tabId], closing: [{path, label}]}
//     reason    — otherBrowser | otherInstance | group (see above)
//     sessionId — the instance the conflicting app(s) are on, for the confirmation message
export const openPlan = ({app, selection, conflicts, tabs}) => {
    const selfConflict = (conflicts || []).find(({path}) => path === app.path)
    const groupConflicts = (conflicts || []).filter(({path}) => path !== app.path)
    const pickedSessionId = selection?.sessionId
    const localTab = (tabs || []).find(({path}) => path === app.path)

    if (selfConflict) {
        if (localTab && pickedSessionId === selfConflict.sessionId) {
            // Already open in THIS browser on the picked instance — just go there.
            return {action: 'focus', tabId: localTab.id}
        }
        // The app closes at its previous location (other browser, or a local move). A
        // same-instance pick moves only the app itself; a different instance also closes
        // its group-mates (the group must stay on one instance).
        const moving = pickedSessionId !== selfConflict.sessionId
        const closing = moving ? [selfConflict, ...groupConflicts] : [selfConflict]
        return toConfirm(moving ? 'otherInstance' : 'otherBrowser', selfConflict.sessionId, closing, tabs)
    }
    if (groupConflicts.length && pickedSessionId !== groupConflicts[0].sessionId) {
        // Group-mates sit on another instance and a new one was picked — they close first.
        return toConfirm('group', groupConflicts[0].sessionId, groupConflicts, tabs)
    }
    // No conflicts, or a same-instance group join (e.g. Notebook joining Lab's instance).
    return {action: 'open'}
}

const toConfirm = (reason, sessionId, closing, tabs) => {
    const paths = new Set(closing.map(({path}) => path))
    return {
        action: 'confirm',
        reason,
        sessionId,
        toRelease: closing.map(({path}) => path),
        toCloseLocal: (tabs || [])
            .filter(({path}) => paths.has(path))
            .map(({id}) => id),
        closing: closing.map(({path, label}) => ({path, label}))
    }
}
