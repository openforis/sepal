package component.budget

import org.openforis.sepal.component.budget.api.Budget

class GenerateUserSpendingReport_Test extends AbstractBudgetTest {
    def setup() {
        updateDefaultBudget(defaultBudget)
    }

    def 'Given no spending and no configured budget, when generating report, all spending is 0, and budgets have default values'() {
        when:
        def report = userSpendingReport()

        then:
        report.instanceSpending == 0
        report.storageSpending == 0
        report.storageUsage == 0
        report.instanceBudget == defaultBudget.instanceSpending
        report.storageBudget == defaultBudget.storageSpending
        report.storageQuota == defaultBudget.storageQuota
    }

    def 'Given an update default budget, when generating report, report matches user budget'() {
        updateDefaultBudget(new Budget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))

        when:
        def report = userSpendingReport()

        then:
        report.instanceBudget == 11
        report.storageBudget == 22
        report.storageQuota == 33
    }

    def 'Given a user budget, when generating report, report matches user budget'() {
        updateUserBudget(new Budget(instanceSpending: 11, storageSpending: 22, storageQuota: 33))

        when:
        def report = userSpendingReport()

        then:
        report.instanceBudget == 11
        report.storageBudget == 22
        report.storageQuota == 33
    }

    def 'Given a 2 hour session costing 4 USD per hour, when generating report, instance spending is 8 USD'() {
        session(start: '2016-01-01', hours: 2, hourlyCost: 4)

        when:
        def report = userSpendingReport()

        then:
        report.instanceSpending == 8d
    }

    def 'Given 100 GB used 15 days then 250 GB for 16 days, and cost is 0.3 USD per GB-Month, 53 USD is spent'() {
        storageCost(0.3)
        storage(gb: 100, start: '2016-01-01', days: 15)
        storage(gb: 250, days: 15.9999)

        when:
        def report = userSpendingReport()

        then:
        Math.round(report.storageSpending) == 53
        report.storageUsage == 250
    }

    def 'Given 200 GB measured after 15 days then 250 GB for 16 days, and cost is 0.3 USD per GB-Month, 53.10 USD is spent'() {
        storageCost(0.3)
        storage(gb: 0, start: '2016-01-01')
        storage(gb: 200, start: '2016-01-16')
        storage(gb: 250, days: 15.9999)

        when:
        def report = userSpendingReport()

        then:
        Math.round(report.storageSpending) == 53
        report.storageUsage == 250
    }

    def 'Given 150 GB for several months, 50 GB 15 days into the month, then 250 GB for 16 days, and cost is 0.3 USD per GB-Month, 53.10 USD is spent'() {
        storageCost(0.3)
        storage(gb: 150, start: '2015-06-01')
        storage(gb: 50, start: '2016-01-16')
        storage(gb: 250, days: 15.9999)

        when:
        def report = userSpendingReport()

        then:
        Math.round(report.storageSpending) == 53
        report.storageUsage == 250
    }
}
