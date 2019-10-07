package org.openforis.sepal.component.budget.api

interface BudgetRepository {
    List<InstanceUse> userInstanceUses(String username, int year, int month)

    StorageUse userStorageUse(String username, int year, int month)

    StorageUse lastUserStorageUse(String username)

    void updateUserStorageUse(String username, StorageUse storageUse)

    Budget userBudget(String username)

    void updateDefaultBudget(Budget budget)

    void updateBudget(String username, Budget budget)

    void saveSpendingReport(Map<String, UserSpendingReport> report)

    Map<String, UserSpendingReport> spendingReport()
}
