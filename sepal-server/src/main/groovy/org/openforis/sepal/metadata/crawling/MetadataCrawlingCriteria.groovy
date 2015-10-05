package org.openforis.sepal.metadata.crawling

import groovy.transform.Immutable


@Immutable
class MetadataCrawlingCriteria {

    int criteriaId
    String fieldName
    String expectedValue
}
