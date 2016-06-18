package org.openforis.sepal.taskexecutor.endpoint

import groovymvc.Controller

interface EndpointRegistry {
    void registerEndpointsWith(Controller controller)
}
