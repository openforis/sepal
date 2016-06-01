package org.openforis.sepal.component.budget.api

interface BudgetRepository {
    List<InstanceUse> userInstanceUses(String username, int year, int month)

    Budget userBudget(String username)

    void updateDefaultBudget(Budget budget)

    void updateBudget(String username, Budget budget)

}
