package org.openforis.sepal.component.files.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.files.query.ListFiles

import static groovy.json.JsonOutput.toJson

class FilesEndpoint {
    private final Component component

    FilesEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {
            get('/user/files') {
                response.contentType = 'application/json'
                def path = params.required('path', String)
                def files = component.submit(
                        new ListFiles(username: currentUser.username, path: path)
                )
                def result = files.collect {
                    def map = [name: it.name, isDirectory: it.directory]
                    if (!map.isDirectory)
                        map.size = it.size()
                    return map
                }
                send toJson(result)
            }
        }
    }
}
