package org.openforis.sepal.component.datasearch.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.datasearch.api.DataSetMetadataGateway
import org.openforis.sepal.component.datasearch.api.SceneMetaDataRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.datasearch.api.DataSet.SENTINEL2

class UpdateSentinel2SceneMetaData extends AbstractCommand<Void> {
}

class UpdateSentinel2SceneMetaDataHandler implements CommandHandler<Void, UpdateSentinel2SceneMetaData> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final DataSetMetadataGateway sentinel2
    private final SceneMetaDataRepository sceneMetaDataRepository

    UpdateSentinel2SceneMetaDataHandler(DataSetMetadataGateway sentinel2, SceneMetaDataRepository sceneMetaDataRepository) {
        this.sentinel2 = sentinel2
        this.sceneMetaDataRepository = sceneMetaDataRepository
    }

    Void execute(UpdateSentinel2SceneMetaData command) {
        LOG.info('Updating Sentinel 2 scene meta-data')
        sentinel2.eachSceneUpdatedSince(sceneMetaDataRepository.lastUpdateBySensor(SENTINEL2)) {
            LOG.info("Storing Sentinel 2 scene meta-data for ${it.size()} scenes")
            sceneMetaDataRepository.updateAll(it)
        }
        return null
    }
}
