package org.openforis.sepal

import org.openforis.sepal.endpoint.Endpoints
import org.openforis.sepal.geoserver.GeoServerLayerMonitor
import org.openforis.sepal.sceneretrieval.SceneRetrievalComponent
import org.openforis.sepal.scenesdownload.ScenesDownloadRepository
import org.openforis.sepal.transaction.SqlConnectionManager

class Main {
    static void main(String[] args) {
        def propertiesLocation = args.length == 1 ? args[0] : "/etc/sdms/sepal.properties"
        SepalConfiguration.instance.setConfigFileLocation(propertiesLocation)

        def retrievalComponent = new SceneRetrievalComponent()

        def poller = new PollingSceneRetriever(
                retrievalComponent.sceneProvider,
                new ScenesDownloadRepository(
                        new SqlConnectionManager(SepalConfiguration.instance.dataSource)
                )
        )
        poller.start()

        new Endpoints().deploy()
        new GeoServerLayerMonitor().start()

        Runtime.addShutdownHook {
            poller.stop()
        }

    }
}
