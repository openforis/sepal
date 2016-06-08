package org.openforis.sepal.component.budget.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class InstanceUse {
    String instanceType
    Date from
    Date to
}
