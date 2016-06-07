package org.openforis.sepal.component.budget.event

import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserInstanceBudgetExceeded implements Event {
    UserInstanceSpending userInstanceSpending
}
