package org.openforis.sepal.component.budget

import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.budget.adapter.JdbcBudgetRepository
import org.openforis.sepal.component.budget.api.InstanceTypes
import org.openforis.sepal.component.budget.command.CheckUserInstanceSpending
import org.openforis.sepal.component.budget.command.CheckUserInstanceSpendingHandler
import org.openforis.sepal.component.budget.command.UpdateBudget
import org.openforis.sepal.component.budget.command.UpdateBudgetHandler
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReport
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReportHandler
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

class BudgetComponent extends AbstractComponent {
    BudgetComponent(
            DataSource dataSource,
            InstanceTypes instanceTypes,
            HandlerRegistryEventDispatcher eventDispatcher,
            Clock clock) {
        super(dataSource, eventDispatcher)

        def connectionManager = new SqlConnectionManager(dataSource)
        def budgetRepository = new JdbcBudgetRepository(connectionManager, clock)

        command(CheckUserInstanceSpending, new CheckUserInstanceSpendingHandler(budgetRepository, instanceTypes, eventDispatcher, clock))
        command(UpdateBudget, new UpdateBudgetHandler(budgetRepository))

        query(GenerateUserSpendingReport, new GenerateUserSpendingReportHandler(budgetRepository, instanceTypes, clock))
    }
}
