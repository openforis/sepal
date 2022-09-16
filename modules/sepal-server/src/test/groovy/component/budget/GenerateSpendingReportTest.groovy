package component.budget

import org.openforis.sepal.component.budget.api.Budget

import static java.lang.Math.round

class GenerateSpendingReportTest extends AbstractBudgetTest {
    def 'Given a user with budget and spending, when generating report, report reflects budget and spending'() {
        updateUserBudget(createBudget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))
        session(start: '2016-01-01', hours: 2, hourlyCost: 4)
        storageCost(0.3)
        storage(gb: 100, start: '2016-01-01', days: 15)
        storage(gb: 250, days: 15.9999)

        when:
        def report = generateSpendingReport()

        then:
        def userReport = report[testUsername]
        userReport.username == testUsername
        userReport.instanceSpending == 8
        round(userReport.storageSpending) == 53
        userReport.storageUsage == 250
        userReport.instanceBudget == 11
        userReport.storageBudget == 22
        userReport.storageQuota == 33
    }

    def 'Give user with budget update request, when generating report, request is included'() {
        updateUserBudget(createBudget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))
        requestBudgetUpdate(
                message: 'increase my budget',
                budget: createBudget(instanceSpending: 12, storageSpending: 23, storageQuota: 34)
        )

        when:
        def report = generateSpendingReport()

        then:
        def budgetUpdateRequest = report[testUsername].budgetUpdateRequest
        budgetUpdateRequest
        budgetUpdateRequest?.message == 'increase my budget'
        budgetUpdateRequest?.instanceSpending == 12
        budgetUpdateRequest?.storageSpending == 23
        budgetUpdateRequest?.storageQuota == 34
    }
}
