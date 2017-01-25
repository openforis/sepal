package org.openforis.sepal.component.files.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.files.api.InvalidPath
import org.openforis.sepal.component.files.command.DeleteFile
import org.openforis.sepal.component.files.query.ListFiles
import org.openforis.sepal.component.files.query.ReadFile
import org.openforis.sepal.query.QueryFailed

import static groovy.json.JsonOutput.toJson

class FilesEndpoint {
    private final Component component

    FilesEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {

            error(QueryFailed, InvalidPath) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson([message: it.message]))
            }

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

            delete('/user/files/{path}') {
                def path = '/' + URLDecoder.decode(params.required('path', String), "UTF-8")
                component.submit(
                        new DeleteFile(username: currentUser.username, path: path)
                )
                send toJson([status: 'success'])
            }

            get('/user/files/download') {
                def path = params.required('path', String)
                def fileStream = component.submit(
                        new ReadFile(username: currentUser.username, path: path)
                )
                def filename = new File(path).name
                def mimeType = request.servletContext.getMimeType(filename) ?: 'application/octet-stream'
                response.setHeader "Content-disposition", "attachment; filename=${filename}"
                response.contentType = mimeType
                response.outputStream.leftShift(fileStream)
                response.outputStream << fileStream
                response.outputStream.flush()
            }
        }
    }
}
