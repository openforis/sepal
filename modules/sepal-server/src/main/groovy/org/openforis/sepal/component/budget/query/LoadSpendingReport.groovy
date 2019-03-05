package org.openforis.sepal.component.budget.query


import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

class LoadSpendingReport implements Query<Map<String, UserSpendingReport>> {
}

class LoadSpendingReportHandler implements QueryHandler<Map<String, UserSpendingReport>, LoadSpendingReport> {
    private final BudgetRepository budgetRepository

    LoadSpendingReportHandler(BudgetRepository budgetRepository) {
        this.budgetRepository = budgetRepository
    }

    Map<String, UserSpendingReport> execute(LoadSpendingReport query) {
        return budgetRepository.spendingReport()
    }
}
