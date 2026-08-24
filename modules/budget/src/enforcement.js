// Level-triggered: every cycle publishes the CURRENT verdict for every known user, so a lost
// event or a restart self-corrects on the next cycle. No edge detection, no state carried over.
export const createEnforcement = ({budgetManager, userClient, events}) => {
    const publishVerdicts = async () => {
        const exceeded = new Set(await budgetManager.usersExceedingBudget())
        await userClient.eachUsername(async username => {
            if (exceeded.has(username))
                events.emitUserBudgetExceeded(username)
            else
                events.emitUserBudgetCleared(username)
        })
    }
    return {publishVerdicts}
}
