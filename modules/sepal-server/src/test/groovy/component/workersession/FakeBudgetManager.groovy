package component.workersession

import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.Spending

class FakeBudgetManager implements BudgetManager {
    private boolean exceeded
    private boolean checked
    private final Map<String, Spending> spendingByUsername = [:]

    void check(String username) {
        checked = true
        if (exceeded)
            throw new IllegalStateException('Budget exceeded')
    }

    Spending userSpending(String username) {
        return spendingByUsername[username]
    }

    void exceeded() {
        this.exceeded = true
    }

    boolean isBudgetChecked() {
        checked
    }

    Spending specifyUserSpending(String username, Spending spending) {
        spendingByUsername[username] = spending
        return spending
    }
}
