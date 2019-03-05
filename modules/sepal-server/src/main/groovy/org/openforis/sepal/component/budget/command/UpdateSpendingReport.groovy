package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.query.GenerateSpendingReport
import org.openforis.sepal.component.budget.query.GenerateSpendingReportHandler

class UpdateSpendingReport extends AbstractCommand<Void> {
}

class UpdateSpendingReportHandler implements CommandHandler<Void, UpdateSpendingReport> {
    private final BudgetRepository budgetRepository
    private final GenerateSpendingReportHandler generateSpendingReportHandler

    UpdateSpendingReportHandler(BudgetRepository budgetRepository, GenerateSpendingReportHandler generateSpendingReportHandler) {
        this.generateSpendingReportHandler = generateSpendingReportHandler
        this.budgetRepository = budgetRepository
    }

    Void execute(UpdateSpendingReport command) {
        Map<String, UserSpendingReport> report = generateSpendingReportHandler.execute(new GenerateSpendingReport())
        budgetRepository.saveSpendingReport(report)
        return null
    }
}
