package org.openforis.sepal.component.datasearch.metadata.crawling

import org.openforis.sepal.component.dataprovider.DataSet
import org.openforis.sepal.component.datasearch.metadata.UsgsDataRepository

abstract class BaseMetadataCrawler implements MetadataCrawler {

    final UsgsDataRepository usgsDataRepository

    BaseMetadataCrawler(UsgsDataRepository usgsDataRepository) {
        this.usgsDataRepository = usgsDataRepository
    }

    protected def updateMetadata(Map metadata, rowId) { usgsDataRepository.updateMetadata(rowId, metadata) }

    protected def insertMetadata(DataSet dataSet, Map metadata) {
        usgsDataRepository.storeMetadata(dataSet.id, metadata)
    }
}
