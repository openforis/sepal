package org.openforis.sepal.model

import groovy.transform.Immutable

@Immutable
class DataSet {
    long dataSetId
    String dataSetName
    String dataSetValue
    boolean dataSetActive
}
