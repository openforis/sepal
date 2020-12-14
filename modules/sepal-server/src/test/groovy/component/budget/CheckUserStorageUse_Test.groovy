package component.budget

import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.event.UserStorageQuotaExceeded
import org.openforis.sepal.component.budget.event.UserStorageSpendingExceeded

class CheckUserStorageUse_Test extends AbstractBudgetTest {
    def 'Given not exceeded storage budget, when checking storage usage, exceeded event is not published'() {
        updateUserBudget(new Budget(storageSpending: 2))
        storageCost(1)
        storage(gb: 1, start: '2016-01-01', days: 30)

        when:
        checkUserStorageUse()

        then:
        notPublished UserStorageSpendingExceeded
    }

    def 'Given exceeded storage budget, when checking storage usage, budget is exceeded'() {
        updateUserBudget(new Budget(storageSpending: 1))
        storageCost(1)
        storage(gb: 2, start: '2016-01-01', days: 30)

        when:
        def userStorageUse = checkUserStorageUse()

        then:
        def event = published UserStorageSpendingExceeded
        event.userStorageUse == userStorageUse
    }

    def 'Given not exceeded storage quota, when checking storage usage, event is not published'() {
        updateUserBudget(new Budget(storageQuota: 2))
        storage(gb: 1)

        when:
        checkUserStorageUse()

        then:
        events.isEmpty()
    }

    def 'Given exceeded storage quota, when checking storage usage, budget is exceeded'() {
        updateUserBudget(new Budget(storageQuota: 1))
        storage(gb: 2)

        when:
        def userStorageUse = checkUserStorageUse()

        then:
        def event = published UserStorageQuotaExceeded
        event.userStorageUse == userStorageUse
    }
}
