package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.hostingservice.WorkerInstanceManager

class BudgetCheck {
    private final ResourceUsageService resourceUsageService
    private final UserBudgetRepository userBudgetRepository
    private final WorkerInstanceManager instanceManager
    private final SessionManager sessionManager

    BudgetCheck(
            ResourceUsageService resourceUsageService,
            UserBudgetRepository userBudgetRepository,
            WorkerInstanceManager instanceManager,
            SessionManager sessionManager
    ) {
        this.resourceUsageService = resourceUsageService
        this.userBudgetRepository = userBudgetRepository
        this.instanceManager = instanceManager
        this.sessionManager = sessionManager
    }

    void verifyBudget(String username) throws BudgetExceeded {
        def monthlyUsage = resourceUsageService.currentMonthlyUsage(username)
        def budget = userBudgetRepository.byUsername(username)

        if (budget.storageQuota && budget.storageQuota < monthlyUsage.storageUsed) {
            sessionManager.closeAll(username)
            throw new StorageQuotaExceeded(budget.storageQuota, monthlyUsage.storageUsed)
        }

        def monthlyStorageSpending = resourceUsageService.monthlyStorageSpending(username)
        if (budget.monthlyStorage && budget.monthlyStorage < monthlyStorageSpending) {
            sessionManager.closeAll(username)
            throw new StorageBudgetExceeded(budget.monthlyStorage, monthlyStorageSpending)
        }

        def monthlyInstanceSpending = resourceUsageService.monthlyInstanceSpending(username, instanceManager.instanceTypes)
        if (budget.monthlyInstance && budget.monthlyInstance < monthlyInstanceSpending) {
            sessionManager.closeAll(username)
            throw new InstanceBudgetExceeded(budget.monthlyInstance, monthlyInstanceSpending)
        }
    }

    static abstract class BudgetExceeded extends RuntimeException {
        BudgetExceeded(String message) {
            super(message)
        }
    }

    static class StorageQuotaExceeded extends BudgetExceeded {
        final double quota
        final double used

        StorageQuotaExceeded(double quota, double used) {
            super("Storage quota exceeded. quota: $quota, used: $used")
            this.quota = quota
            this.used = used
        }
    }

    static class StorageBudgetExceeded extends BudgetExceeded {
        final double budget
        final double spending

        StorageBudgetExceeded(double budget, double spending) {
            super("Storage budget exceeded. budget: $budget, spending: $spending")
            this.budget = budget
            this.spending = spending
        }
    }

    static class InstanceBudgetExceeded extends BudgetExceeded {
        final double budget
        final double spending

        InstanceBudgetExceeded(double budget, double spending) {
            super("Instance budget exceeded. budget: $budget, spending: $spending")
            this.budget = budget
            this.spending = spending
        }
    }
}
