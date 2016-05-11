package org.openforis.sepal.component.datasearch.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.datasearch.SceneMetaDataRepository
import org.openforis.sepal.component.datasearch.usgs.UsgsGateway

import static org.openforis.sepal.component.datasearch.MetaDataSource.USGS

class UpdateUsgsSceneMetaData extends AbstractCommand<Void> {
}

class UpdateUsgsSceneMetaDataHandler implements CommandHandler<Void, UpdateUsgsSceneMetaData> {
    private final UsgsGateway usgs
    private final SceneMetaDataRepository sceneMetaDataRepository

    UpdateUsgsSceneMetaDataHandler(UsgsGateway usgs, SceneMetaDataRepository sceneMetaDataRepository) {
        this.usgs = usgs
        this.sceneMetaDataRepository = sceneMetaDataRepository
    }

    Void execute(UpdateUsgsSceneMetaData command) {
        usgs.eachSceneUpdatedSince(sceneMetaDataRepository.lastUpdate(USGS)) {
            sceneMetaDataRepository.updateAll(it)
        }
        return null
    }
}
