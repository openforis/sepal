package org.openforis.sepal.component.workersession.api

interface BudgetManager {
    void check(String username)

    Spending userSpending(String username)
}