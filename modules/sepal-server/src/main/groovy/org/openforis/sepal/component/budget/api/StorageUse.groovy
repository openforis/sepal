package org.openforis.sepal.component.budget.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class StorageUse {
    double gbHours
    double gb
    Date updateTime
}
