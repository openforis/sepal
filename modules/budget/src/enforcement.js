import {getLogger} from '#sepal/log'

const log = getLogger('sepal.budget.enforcement')

// Level-triggered: every cycle publishes the CURRENT verdict for every user it covers, so a lost
// event or a restart self-corrects on the next cycle. No edge detection, no state carried over.
//
// publishVerdicts covers every known user and runs hourly. publishOpenSessionVerdicts covers only
// users with open sessions — the only ones whose instances need stopping — and runs every minute,
// so running out of budget stops a user's instances within a minute rather than an hour.
//
// A user whose verdict fails is logged and skipped, so one failure does not leave everyone after
// them unenforced until the next cycle.
export const createEnforcement = ({budgetManager, userClient, openSessionUse, events}) => {
    const publishVerdict = async username => {
        try {
            const {exceeded, reason, dataQuotaExceeded} = await budgetManager.verdict(username)
            if (exceeded)
                events.emitUserBudgetExceeded(username, reason, dataQuotaExceeded)
            else
                events.emitUserBudgetCleared(username)
        } catch (error) {
            log.error(`Failed to publish the budget verdict for ${username}`, error)
        }
    }

    const publishVerdicts = async () =>
        userClient.eachUsername(publishVerdict)

    const publishOpenSessionVerdicts = async () => {
        for (const username of await openSessionUse.usersWithOpenSessions())
            await publishVerdict(username)
    }

    return {publishVerdicts, publishOpenSessionVerdicts}
}
