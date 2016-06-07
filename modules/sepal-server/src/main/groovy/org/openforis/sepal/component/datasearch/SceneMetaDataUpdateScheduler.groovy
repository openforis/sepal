package org.openforis.sepal.component.datasearch

import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.component.datasearch.command.UpdateUsgsSceneMetaData
import org.openforis.sepal.util.NamedThreadFactory
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService

import static java.util.concurrent.TimeUnit.DAYS

class SceneMetaDataUpdateScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final CommandDispatcher commandDispatcher
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory('sceneMetaDataUpdate')
    )

    SceneMetaDataUpdateScheduler(CommandDispatcher commandDispatcher) {
        this.commandDispatcher = commandDispatcher
    }

    void start() {
        executor.scheduleWithFixedDelay({
            updateSceneMetaData()
        }, 0, 1, DAYS)
    }

    private void updateSceneMetaData() {
        try {
            commandDispatcher.submit(new UpdateUsgsSceneMetaData())
        } catch (Exception e) {
            LOG.error("Error updating scene meta-data", e)
        }
    }

    void stop() {
        executor.shutdown()
    }
}
