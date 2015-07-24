package org.openforis.sepal.geoserver

import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface MonitorChangeHandler {

    void performCheck()

    void layerAdded(String username, String layerName)

    void layerRemoved(String username, String layerName)

    void userAdded(String username)

    void userRemoved(String username)

    void layerChanged(String username, String layerName)

}

class FSMonitorChangeHandler implements MonitorChangeHandler {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final LayerRepository layerRepository
    private final GeoServerClient geoServerClient

    public FSMonitorChangeHandler(LayerRepository layerRepository, GeoServerClient geoServerClient) {
        this.layerRepository = layerRepository
        this.geoServerClient = geoServerClient
    }

    @Override
    void performCheck() {
        layerRepository.getHomeUsers().each {
            userAdded(it)
        }
    }

    void userAdded(String username) {
        layerRepository.checkUserHomeLayerContainer(username)
        layerRepository.checkUserTargetContainer(username)
        geoServerClient.addWorkspace(username)
        layerRepository.getHomeUserLayers(username).each {
            layerAdded(username, it)
        }
    }

    @Override
    void userRemoved(String username) {
        layerRepository.removeUserTargetContainer(username)
        geoServerClient.removeWorkspace(username)
    }

    @Override
    void layerAdded(String username, String layerName) {
        layerRepository.checkLayerTargetContainer(username, layerName)
        if (layerRepository.isLayerReady(username, layerName)) {
            if (layerRepository.isLayerContentChanged(username, layerName)) {
                layerChanged(username, layerName)
            } else {
                LOG.debug("Layer content didn't changed since last check.")
            }
        } else {
            LOG.info("Layer contains no data. GeoServer creation is deferred")
        }
    }

    @Override
    void layerRemoved(String username, String layerName) {
        geoServerClient.removeLayer(username, layerName)
        layerRepository.removeLayerTargetContainer(username, layerName)
    }

    @Override
    void layerChanged(String username, String layerName) {
        geoServerClient.removeLayer(username, layerName)
        layerRepository.cleanTargetLayerContainer(username, layerName)
        String targetLayerLocation = layerRepository.getTargetLayerLocation(username, layerName)
        layerRepository.copyHomeContentToTarget(username, layerName)
        if (layerRepository.applyProcessingChain(username, layerName)) {
            geoServerClient.publishLayer(username, layerName, targetLayerLocation)
        }
        layerRepository.storeLayerIndex(username, layerName)
    }


}

