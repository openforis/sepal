package org.openforis.sepal.component.budget.event

import groovy.transform.Immutable
import org.openforis.sepal.component.budget.api.UserStorageUse
import org.openforis.sepal.event.Event

@Immutable
class UserStorageSpendingNotExceeded implements Event {
    UserStorageUse userStorageUse
}
