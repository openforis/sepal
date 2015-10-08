package org.openforis.sepal.metadata

import groovy.transform.ToString
import org.openforis.sepal.metadata.crawling.MetadataCrawlingCriteria
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
    Set<MetadataCrawlingCriteria> crawlingCriterias

    MetadataProvider() {
        dataSets = new HashSet<DataSet>()
        crawlingCriterias = new HashSet<DataSet>()
    }


}
