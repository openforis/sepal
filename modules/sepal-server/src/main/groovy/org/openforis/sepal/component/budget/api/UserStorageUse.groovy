package org.openforis.sepal.component.budget.api

import groovy.transform.Immutable

@Immutable
class UserStorageUse {
    String username
    double spending
    double use
    double budget
    double quota
}
