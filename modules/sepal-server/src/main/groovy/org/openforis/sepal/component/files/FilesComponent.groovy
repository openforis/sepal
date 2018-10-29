package org.openforis.sepal.component.files

import groovymvc.Controller
import org.openforis.sepal.component.NonTransactionalComponent
import org.openforis.sepal.component.files.command.*
import org.openforis.sepal.component.files.endpoint.FilesEndpoint
import org.openforis.sepal.component.files.query.*
import org.openforis.sepal.endpoint.EndpointRegistry

class FilesComponent extends NonTransactionalComponent implements EndpointRegistry {
    FilesComponent(File homeDir) {
        query(ListFiles, new ListFilesHandler(homeDir))
        query(ReadFile, new ReadFileHandler(homeDir))
        query(GbUsed, new GbUsedHandler(homeDir))
        query(QueryFiles, new QueryFilesHandler(homeDir))
        command(DeleteFile, new DeleteFileHandler(homeDir))
        command(SetArchivable, new SetArchivableHandler(homeDir))
    }

    void registerEndpointsWith(Controller controller) {
        new FilesEndpoint(this).registerWith(controller)
    }
}
