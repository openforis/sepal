package org.openforis.sepal.metadata.crawling

import org.openforis.sepal.metadata.UsgsDataRepository
import org.openforis.sepal.scene.DataSet

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
