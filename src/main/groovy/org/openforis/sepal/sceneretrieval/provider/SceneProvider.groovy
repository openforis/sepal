package org.openforis.sepal.sceneretrieval.provider

interface SceneProvider {
    /**
     * Request scenes to be retrieved asynchronously. Requests the provider is unable to retrieve are returned.
     * @return requests not retrievable by this provider
     */
    Collection<SceneRequest> retrieve(List<SceneRequest> requests)

    void stop()
}