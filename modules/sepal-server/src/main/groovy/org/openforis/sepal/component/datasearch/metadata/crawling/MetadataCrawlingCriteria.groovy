package org.openforis.sepal.component.datasearch.metadata.crawling

import groovy.transform.Immutable


@Immutable
class MetadataCrawlingCriteria {

    Long criteriaId
    String fieldName
    String expectedValue
}
