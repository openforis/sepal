package org.openforis.sepal.component.budget.event

import groovy.transform.Immutable
import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.event.Event

@Immutable
class UserInstanceBudgetExceeded implements Event {
    UserInstanceSpending userInstanceSpending
}
