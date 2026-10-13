// Level-triggered: every cycle publishes the CURRENT verdict for every user it covers, so a lost
// event or a restart self-corrects on the next cycle. No edge detection, no state carried over.
//
// publishVerdicts covers every known user and runs hourly. publishOpenSessionVerdicts covers only
// users with open sessions — the only ones whose instances need stopping — and runs every minute,
// so running out of budget stops a user's instances within a minute rather than an hour.
export const createEnforcement = ({budgetManager, userClient, openSessionUse, events}) => {
    const publish = ({username, exceeded, reason}) =>
        exceeded
            ? events.emitUserBudgetExceeded(username, reason)
            : events.emitUserBudgetCleared(username)

    const publishVerdicts = async () =>
        userClient.eachUsername(async username => publish(await budgetManager.verdict(username)))

    const publishOpenSessionVerdicts = async () => {
        for (const username of await openSessionUse.usersWithOpenSessions())
            publish(await budgetManager.verdict(username))
    }

    return {publishVerdicts, publishOpenSessionVerdicts}
}
