package org.openforis.sepal.dataprovider.s3landsat8

import groovy.transform.Immutable

@Immutable
class IndexEntry {
    String fileName
    String url
    double sizeInBytes
}
