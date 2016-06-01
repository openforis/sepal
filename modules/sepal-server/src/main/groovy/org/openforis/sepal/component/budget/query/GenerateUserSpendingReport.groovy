package org.openforis.sepal.component.budget.query

import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.InstanceTypes
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.internal.InstanceSpendingCalculator
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.DateTime

class GenerateUserSpendingReport implements Query<UserSpendingReport> {
    String username
}

class GenerateUserSpendingReportHandler implements QueryHandler<UserSpendingReport, GenerateUserSpendingReport> {
    private final BudgetRepository budgetRepository
    private final InstanceTypes instanceTypes
    private final Clock clock

    GenerateUserSpendingReportHandler(
            BudgetRepository budgetRepository,
            InstanceTypes instanceTypes,
            Clock clock) {
        this.budgetRepository = budgetRepository
        this.instanceTypes = instanceTypes
        this.clock = clock
    }

    UserSpendingReport execute(GenerateUserSpendingReport query) {
        def now = clock.now()
        def year = DateTime.year(now)
        def month = DateTime.monthOfYear(now)
        def instanceUses = budgetRepository.userInstanceUses(query.username, year, month)
        def instanceSpending = new InstanceSpendingCalculator(instanceTypes.hourCostByInstanceType())
                .calculate(year, month, instanceUses)
        def budget = budgetRepository.userBudget(query.username)
        new UserSpendingReport(
                username: query.username,
                instanceSpending: instanceSpending,
                storageSpending: 0,
                storageUsage: 0,
                instanceBudget: budget.instanceSpending,
                storageBudget: budget.storageSpending,
                storageQuota: budget.storageQuota
        )
    }
}