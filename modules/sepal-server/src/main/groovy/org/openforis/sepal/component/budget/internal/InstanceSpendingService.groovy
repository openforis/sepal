package org.openforis.sepal.component.budget.internal

import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.DateTime

class InstanceSpendingService {
    private final BudgetRepository budgetRepository
    private final HostingService hostingService
    private final Clock clock

    InstanceSpendingService(BudgetRepository budgetRepository, HostingService hostingService, Clock clock) {
        this.budgetRepository = budgetRepository
        this.hostingService = hostingService
        this.clock = clock
    }

    double instanceSpending(String username) {
        def now = clock.now()
        def year = DateTime.year(now)
        def month = DateTime.monthOfYear(now)
        def instanceUses = budgetRepository.userInstanceUses(username, year, month)
        new InstanceSpendingCalculator(hostingService.hourlyCostByInstanceType())
                .calculate(year, month, instanceUses)
    }
}
