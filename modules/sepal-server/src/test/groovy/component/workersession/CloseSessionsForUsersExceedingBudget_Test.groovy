package component.workersession

import org.openforis.sepal.component.workersession.api.Spending

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.CLOSED

class CloseSessionsForUsersExceedingBudget_Test extends AbstractWorkerSessionTest {
    def 'Given user exceeding budget, when submitting command, user sessions are closed'() {
        activeSession()
        userExceedingBudget()

        when:
        closeSessionsForUsersExcedingBudget()

        then:
        oneSessionIs(CLOSED)
    }

    private void userExceedingBudget() {
        budgetManager.setUserSpending(testUsername, new Spending(
                monthlyInstanceBudget: 1,
                monthlyInstanceSpending: 9999,
                monthlyStorageBudget: 1,
                monthlyStorageSpending: 9999,
                storageQuota: 1,
                storageUsed: 9999
        ))
        budgetManager.exceeded()
    }
}
