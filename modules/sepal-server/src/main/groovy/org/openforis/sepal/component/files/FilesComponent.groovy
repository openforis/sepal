package org.openforis.sepal.component.files

import groovymvc.Controller
import org.openforis.sepal.component.NonTransactionalComponent
import org.openforis.sepal.component.files.command.*
import org.openforis.sepal.component.files.endpoint.FilesEndpoint
import org.openforis.sepal.component.files.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.Topic

class FilesComponent extends NonTransactionalComponent implements EndpointRegistry {
    private final Topic publishTopic

    FilesComponent(File homeDir, Topic publishTopic) {
        this.publishTopic = publishTopic
        query(ListFiles, new ListFilesHandler(homeDir))
        query(ReadFile, new ReadFileHandler(homeDir))
        query(GbUsed, new GbUsedHandler(homeDir))
        query(QueryFiles, new QueryFilesHandler(homeDir))
        command(DeleteFile, new DeleteFileHandler(homeDir, publishTopic))
        command(SetArchivable, new SetArchivableHandler(homeDir))
    }

    void registerEndpointsWith(Controller controller) {
        new FilesEndpoint(this).registerWith(controller)
    }

    void onStart() {
        super.onStart()
    }

    void onStop() {

    }
}
