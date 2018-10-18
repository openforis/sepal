package org.openforis.sepal.component.budget.api

import groovy.transform.Immutable

@Immutable
class InstanceUse {
    String instanceType
    Date from
    Date to
}
