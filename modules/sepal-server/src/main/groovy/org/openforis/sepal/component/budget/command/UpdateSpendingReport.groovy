package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.query.GenerateSpendingReport
import org.openforis.sepal.component.budget.query.GenerateSpendingReportHandler
import org.openforis.sepal.transaction.TransactionManager

class UpdateSpendingReport extends AbstractCommand<Void> {
}

class UpdateSpendingReportHandler implements NonTransactionalCommandHandler<Void, UpdateSpendingReport> {
    private final BudgetRepository budgetRepository
    private final GenerateSpendingReportHandler generateSpendingReportHandler
    private final TransactionManager transactionManager

    UpdateSpendingReportHandler(
        BudgetRepository budgetRepository,
        GenerateSpendingReportHandler generateSpendingReportHandler,
        TransactionManager transactionManager) {
        this.generateSpendingReportHandler = generateSpendingReportHandler
        this.budgetRepository = budgetRepository
        this.transactionManager = transactionManager
    }

    Void execute(UpdateSpendingReport command) {
        Map<String, UserSpendingReport> report = generateSpendingReportHandler.execute(new GenerateSpendingReport())
        transactionManager.withTransaction {
            budgetRepository.saveSpendingReport(report)
        }
        return null
    }
}
