// Builds a UserSessionReport { sessions, instanceTypes }:
//   sessions      — the user's PENDING+ACTIVE sessions filtered by workerType, each carrying
//                   apps: [{path, label}] (the app ↔ session associations on that session, from
//                   appRepo.appsForSessions), usage (the latest resource-usage sample from
//                   usageRepo.latestForSessions, or null), and what the sampler last observed:
//                   terminals (live terminal sessions) and verdict ('busy' | 'unused' | 'unknown').
//                   Both registries are optional — absent reads as nothing observed.
//   instanceTypes — instanceManager.getInstanceTypes()
//
// The report carries no spending: the budget module pushes {spending, budgetUpdateRequest}
// straight to the GUI over its own websocket endpoint (modules/budget/src/ws.js).

import {State} from '../workerSession.js'

const generateUserSessionReport = async (
    {username, workerType}, {repo, appRepo, instanceManager, usageRepo, terminals, verdicts}
) => {
    const sessions = await repo.userSessions(username, [State.PENDING, State.ACTIVE], workerType)
    const sessionIds = sessions.map(({id}) => id)
    const appsBySession = await appRepo.appsForSessions(sessionIds)
    const usageBySession = usageRepo
        ? await usageRepo.latestForSessions(sessionIds)
        : new Map()
    const sessionsWithApps = sessions.map(session => ({
        ...session,
        apps: appsBySession.get(session.id) ?? [],
        usage: usageBySession.get(session.id) ?? null,
        terminals: terminals?.get(session.id) ?? 0,
        verdict: verdicts?.get(session.id) ?? 'unknown',
    }))
    return {
        sessions: sessionsWithApps,
        instanceTypes: instanceManager.getInstanceTypes(),
    }
}

export {generateUserSessionReport}
