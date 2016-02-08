package org.openforis.sepal.component.dataprovider.retrieval.provider.s3landsat8

import groovy.transform.Immutable

@Immutable
class IndexEntry {
    String fileName
    String url
    double sizeInBytes
}
