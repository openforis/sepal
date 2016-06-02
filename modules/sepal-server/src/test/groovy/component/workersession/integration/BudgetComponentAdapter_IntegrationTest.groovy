package component.workersession.integration

import component.budget.AbstractBudgetTest
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.workersession.adapter.BudgetComponentAdapter
import org.openforis.sepal.component.workersession.api.InstanceBudgetExceeded
import org.openforis.sepal.component.workersession.api.StorageBudgetExceeded
import org.openforis.sepal.component.workersession.api.StorageQuotaExceeded

class BudgetComponentAdapter_IntegrationTest extends AbstractBudgetTest {
    def adapter = new BudgetComponentAdapter(component)

    def 'Given not exceeding instance budget, when checking budget, no exception is thrown'() {
        notExceededInstanceBudget()

        when:
        adapter.check(testUsername)

        then:
        notThrown InstanceBudgetExceeded
    }

    def 'Given exceeded instance budget, when checking budget, exception is thrown'() {
        exceededInstanceBudget()

        when:
        adapter.check(testUsername)

        then:
        thrown InstanceBudgetExceeded
    }

    def 'Given not exceeding storage budget, when checking budget, no exception is thrown'() {
        notExceededStorageBudget()

        when:
        adapter.check(testUsername)

        then:
        notThrown StorageBudgetExceeded
    }

    def 'Given exceeded storage budget, when checking budget, exception is thrown'() {
        exceededStorageBudget()

        when:
        adapter.check(testUsername)

        then:
        thrown StorageBudgetExceeded
    }

    def 'Given not exceeding storage quota, when checking budget, no exception is thrown'() {
        notExceededStorageQuota()

        when:
        adapter.check(testUsername)

        then:
        notThrown StorageQuotaExceeded
    }

    def 'Given exceeded storage quota, when checking budget, exception is thrown'() {
        exceededStorageQuota()

        when:
        adapter.check(testUsername)

        then:
        thrown StorageQuotaExceeded
    }


    private void exceededInstanceBudget() {
        updateUserBudget(new Budget(instanceSpending: 100))
        session(start: '2016-01-01', hours: 1, hourlyCost: 101)
    }

    private void notExceededInstanceBudget() {
        updateUserBudget(new Budget(instanceSpending: 100))
        session(start: '2016-01-01', hours: 1, hourlyCost: 99)
    }

    private void exceededStorageBudget() {
        updateUserBudget(new Budget(storageSpending: 1, storageQuota: 999))
        storageCost(1)
        storage(gb: 2, start: '2016-01-01', days: 30)
    }

    private void notExceededStorageBudget() {
        updateUserBudget(new Budget(storageSpending: 2, storageQuota: 999))
        storageCost(1)
        storage(gb: 1, start: '2016-01-01', days: 30)
    }

    private void exceededStorageQuota() {
        updateUserBudget(new Budget(storageQuota: 2))
        storage(gb: 3)
    }

    private void notExceededStorageQuota() {
        updateUserBudget(new Budget(storageQuota: 2))
        storage(gb: 1)
    }
}
