package org.openforis.sepal.component.apps

import groovymvc.Controller
import org.openforis.sepal.component.NonTransactionalComponent
import org.openforis.sepal.component.endpoint.AppsEndpoint
import org.openforis.sepal.component.files.ListApps
import org.openforis.sepal.component.files.ListAppsHandler
import org.openforis.sepal.endpoint.EndpointRegistry

class AppsComponent extends NonTransactionalComponent implements EndpointRegistry {
    AppsComponent(File appsFile) {
        query(ListApps, new ListAppsHandler(appsFile))
    }

    void registerEndpointsWith(Controller controller) {
        new AppsEndpoint(this).registerWith(controller)
    }
}
