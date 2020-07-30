package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.query.GenerateSpendingReportHandler
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReport
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReportHandler
import org.openforis.sepal.transaction.TransactionManager

class UpdateUserSpendingReport extends AbstractCommand<UserSpendingReport> {
    String userToUpdate
}

class UpdateUserSpendingReportHandler implements NonTransactionalCommandHandler<UserSpendingReport, UpdateUserSpendingReport> {
    private final BudgetRepository budgetRepository
    private final GenerateUserSpendingReportHandler generateUserSpendingReportHandler
    private final TransactionManager transactionManager

    UpdateUserSpendingReportHandler(
            BudgetRepository budgetRepository,
            GenerateUserSpendingReportHandler generateUserSpendingReportHandler) {
        this.generateUserSpendingReportHandler = generateUserSpendingReportHandler
        this.budgetRepository = budgetRepository
        this.transactionManager = transactionManager
    }

    UserSpendingReport execute(UpdateUserSpendingReport command) {
        def username = command.userToUpdate
        def report = generateUserSpendingReportHandler.execute(new GenerateUserSpendingReport(username: username))
        budgetRepository.updateSpendingReport(username, report)
        return report
    }
}
