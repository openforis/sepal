package org.openforis.sepal.component.workersession.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component

class WorkerSessionEndpoint {
    private final Component component

    WorkerSessionEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {

        }
    }
}
