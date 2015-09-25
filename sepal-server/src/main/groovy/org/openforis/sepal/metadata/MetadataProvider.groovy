package org.openforis.sepal.metadata

import groovy.transform.ToString
import org.openforis.sepal.scene.DataSet

@ToString
class MetadataProvider {

    int id
    String name
    Boolean active
    String entrypoint
    int iterations
    int iterationSize
    Date lastStartTime
    Date lastEndTime
    Set<DataSet> dataSets

    MetadataProvider(){ dataSets = new HashSet<DataSet>()}

}
