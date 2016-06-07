package org.openforis.sepal.component.workersession.adapter

import org.openforis.sepal.component.Component
import org.openforis.sepal.component.budget.command.CheckUserInstanceSpending
import org.openforis.sepal.component.budget.command.CheckUserStorageUse
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReport
import org.openforis.sepal.component.workersession.api.*

class BudgetComponentAdapter implements BudgetManager {
    private final Component budgetComponent

    BudgetComponentAdapter(Component budgetComponent) {
        this.budgetComponent = budgetComponent
    }

    void check(String username) {
        def instanceSpending = budgetComponent.submit(new CheckUserInstanceSpending(username: username))
        if (instanceSpending.budgetExceeded)
            throw new InstanceBudgetExceeded()
        def storageUse = budgetComponent.submit(new CheckUserStorageUse(username: username))
        if (storageUse.budgetExceeded)
            throw new StorageBudgetExceeded()
        if (storageUse.quotaExceeded)
            throw new StorageQuotaExceeded()
    }

    Spending userSpending(String username) {
        def report = budgetComponent.submit(new GenerateUserSpendingReport(username))
        return new Spending(
                monthlyInstanceBudget: report.instanceBudget,
                monthlyInstanceSpending: report.instanceSpending,
                monthlyStorageBudget: report.storageBudget,
                monthlyStorageSpending: report.storageSpending,
                storageQuota: report.storageQuota,
                storageUsed: report.storageUsage
        )
    }
}
