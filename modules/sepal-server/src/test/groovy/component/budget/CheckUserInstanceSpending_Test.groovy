package component.budget

import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.event.UserInstanceBudgetExceeded
import org.openforis.sepal.component.budget.event.UserInstanceBudgetNotExceeded

class CheckUserInstanceSpending_Test extends AbstractBudgetTest {
    def 'Given no usage, when checking instance usage, instance usage is not exceeded'() {
        when:
        def spending = checkUserInstanceSpending()

        then:
        def event = published UserInstanceBudgetNotExceeded
        event.userInstanceSpending == spending
        spending.instanceSpending == 0
        spending.instanceBudget == defaultBudget.instanceSpending
    }

    def 'Given spending exceeding budget, when checking instance usage, instance usage is exceeded'() {
        updateUserBudget(new Budget(instanceSpending: 100))
        session(start: '2016-01-01', hours: 1, hourlyCost: 101)

        when:
        def spending = checkUserInstanceSpending()

        then:
        def event = published UserInstanceBudgetExceeded
        event.userInstanceSpending == spending
        spending.instanceSpending == 101
        spending.instanceBudget == 100
    }

    def 'Given spending same as budget, when checking instance usage, instance usage is not exceeded'() {
        updateUserBudget(new Budget(instanceSpending: 100))
        session(start: '2016-01-01', hours: 1, hourlyCost: 100)

        when:
        def spending = checkUserInstanceSpending()

        then:
        def event = published UserInstanceBudgetNotExceeded
        event.userInstanceSpending == spending
        spending.instanceSpending == 100
        spending.instanceBudget == 100
    }
}
