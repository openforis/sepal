package org.openforis.sepal.endpoint

import groovymvc.Controller

interface EndpointRegistry {
    void registerEndpointsWith(Controller controller)
}
