package org.openforis.sepal.component.files

import groovymvc.Controller
import org.openforis.sepal.component.ReadOnlyComponent
import org.openforis.sepal.component.files.endpoint.FilesEndpoint
import org.openforis.sepal.component.files.query.ListFiles
import org.openforis.sepal.component.files.query.ListFilesHandler
import org.openforis.sepal.endpoint.EndpointRegistry

class FilesComponent extends ReadOnlyComponent implements EndpointRegistry {
    FilesComponent(File homeDir) {
        query(ListFiles, new ListFilesHandler(homeDir))
    }

    void registerEndpointsWith(Controller controller) {
        new FilesEndpoint(this).registerWith(controller)
    }
}
