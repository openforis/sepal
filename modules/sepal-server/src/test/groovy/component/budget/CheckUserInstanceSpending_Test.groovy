package component.budget

import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.event.UserInstanceBudgetExceeded
import org.openforis.sepal.component.budget.event.UserInstanceBudgetNotExceeded

class CheckUserInstanceSpending_Test extends AbstractBudgetTest {
    def 'Given no usage, when checking instance usage, instance usage is not exceeded'() {
        when:
        def usage = checkUserInstanceUsage()

        then:
        published UserInstanceBudgetNotExceeded
        usage.instanceSpending == 0
        usage.instanceBudget == defaultBudget.instanceSpending
    }

    def 'Given spending exceeding budget, when checking instance usage, instance usage is exceeded'() {
        updateUserBudget(new Budget(instanceSpending: 100))
        session(start: '2016-01-01', hours: 1, hourlyCost: 101)

        when:
        def usage = checkUserInstanceUsage()

        then:
        published UserInstanceBudgetExceeded
        usage.instanceSpending == 101
        usage.instanceBudget == 100
    }

    def 'Given spending same as budget, when checking instance usage, instance usage is not exceeded'() {
        updateUserBudget(new Budget(instanceSpending: 100))
        session(start: '2016-01-01', hours: 1, hourlyCost: 100)

        when:
        def usage = checkUserInstanceUsage()

        then:
        published UserInstanceBudgetNotExceeded
        usage.instanceSpending == 100
        usage.instanceBudget == 100
    }
}
