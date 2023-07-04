package component.budget

import org.openforis.sepal.component.budget.api.Budget

class UpdateBudgetTest extends AbstractBudgetTest {
    def 'Given a user with a budget update request, when updating the budget, the request is closed'() {
        requestBudgetUpdate(
                message: 'increase my budget',
                budget: createBudget(instanceSpending: 12, storageSpending: 23, storageQuota: 34)
        )

        when:
        updateUserBudget(createBudget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))

        then:
        def report = userSpendingReport()
        !report.budgetUpdateRequest
    }
}
