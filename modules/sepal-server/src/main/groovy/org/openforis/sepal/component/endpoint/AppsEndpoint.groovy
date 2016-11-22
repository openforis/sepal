package org.openforis.sepal.component.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.files.ListApps

import static groovy.json.JsonOutput.toJson

class AppsEndpoint {
    private final Component component

    AppsEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {
            controller.get('/apps') {
                response.contentType = "application/json"
                def apps = component.submit(new ListApps())
                send toJson(apps)
            }
        }
    }
}
