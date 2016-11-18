package component.budget

import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.UserSpendingReport

import static java.lang.Math.round

class GenerateSpendingReportTest extends AbstractBudgetTest {
    def 'Given a user without specified budget and no spending, when generating report, user got default budget and no spending'() {

        when:
        def report = generateSpendingReport()

        then:
        report[testUsername] == new UserSpendingReport(
                username: testUsername,
                instanceSpending: 0,
                storageSpending: 0,
                storageUsage: 0,
                instanceBudget: defaultBudget.instanceSpending,
                storageBudget: defaultBudget.storageSpending,
                storageQuota: defaultBudget.storageQuota
        )
    }

    def 'Given a user with budget and spending, when generating report, report reflects budget and spending'() {
        updateUserBudget(new Budget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))
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
}
