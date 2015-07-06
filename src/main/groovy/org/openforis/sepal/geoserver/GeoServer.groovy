package org.openforis.sepal.geoserver

interface GeoServer {
    void addWorkspace(String user)

    void removeWorkspace(String user)

    void removeLayer(String user, String layerName)

    void publishLayer(String user, File dir)

    void publishStore(String user, File dir)
}
