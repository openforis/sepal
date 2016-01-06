package org.openforis.sepal.scene

interface SceneProvider {

    /**
     * Request scenes to be retrieved asynchronously. Requests the crawling is unable to retrieve are returned.
     * @return requests not retrievable by this crawling
     */

    Collection<SceneRequest> retrieve(List<SceneRequest> requests)

    void stop()
}