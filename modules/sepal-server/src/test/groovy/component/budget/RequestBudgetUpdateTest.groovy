package component.budget

import org.openforis.sepal.component.budget.api.Budget

class RequestBudgetUpdateTest extends AbstractBudgetTest {
    def 'When requesting budget update, then spending report contains request'() {
        updateUserBudget(createBudget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))

        when:
        requestBudgetUpdate(
                message: 'increase my budget',
                budget: createBudget(instanceSpending: 12, storageSpending: 23, storageQuota: 34)
        )

        then:
        def report = userSpendingReport()
        report.budgetUpdateRequest?.message == 'increase my budget'
        report.budgetUpdateRequest?.instanceSpending == 12
        report.budgetUpdateRequest?.storageSpending == 23
        report.budgetUpdateRequest?.storageQuota == 34
    }
}
