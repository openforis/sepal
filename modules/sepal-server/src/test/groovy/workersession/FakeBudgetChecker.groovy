package workersession

import org.openforis.sepal.component.workersession.api.BudgetChecker

class FakeBudgetChecker implements BudgetChecker {
    private boolean exceeded
    private boolean checked


    void check(String username) {
        checked = true
        if (exceeded)
            throw new IllegalStateException('Budget exceeded')
    }

    void exceeded() {
        this.exceeded = true
    }

    boolean isBudgetChecked() {
        checked
    }
}
