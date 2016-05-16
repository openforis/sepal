package org.openforis.sepal.component.datasearch.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.datasearch.SceneMetaDataRepository
import org.openforis.sepal.component.datasearch.usgs.UsgsGateway
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.datasearch.MetaDataSource.USGS

class UpdateUsgsSceneMetaData extends AbstractCommand<Void> {
}

class UpdateUsgsSceneMetaDataHandler implements CommandHandler<Void, UpdateUsgsSceneMetaData> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UsgsGateway usgs
    private final SceneMetaDataRepository sceneMetaDataRepository

    UpdateUsgsSceneMetaDataHandler(UsgsGateway usgs, SceneMetaDataRepository sceneMetaDataRepository) {
        this.usgs = usgs
        this.sceneMetaDataRepository = sceneMetaDataRepository
    }

    Void execute(UpdateUsgsSceneMetaData command) {
        LOG.info('Updating USGS scene meta-data')
        usgs.eachSceneUpdatedSince(sceneMetaDataRepository.lastUpdateBySensor(USGS)) {
            LOG.info("Storing USGS scene meta-data for ${it.size()} scenes")
            sceneMetaDataRepository.updateAll(it)
        }
        return null
    }
}
