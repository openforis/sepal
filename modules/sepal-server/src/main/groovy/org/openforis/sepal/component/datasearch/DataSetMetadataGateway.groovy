package org.openforis.sepal.component.datasearch

interface DataSetMetadataGateway {

    /**
     * Invokes callback for scenes updated since provided date.
     *
     * @param lastUpdateBySensor scene updated before this date will not be included
     * @param callback invoked with list of SceneMetaData instances
     */
    void eachSceneUpdatedSince(Map<String, Date> lastUpdateBySensor, Closure callback) throws SceneMetaDataRetrievalFailed

    static class SceneMetaDataRetrievalFailed extends RuntimeException {
        SceneMetaDataRetrievalFailed(String message) {
            super(message)
        }
    }
}