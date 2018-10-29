package org.openforis.sepal.component.files.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.files.api.InvalidPath
import org.openforis.sepal.component.files.command.*
import org.openforis.sepal.component.files.query.*
import org.openforis.sepal.query.QueryFailed

import static groovy.json.JsonOutput.toJson

class FilesEndpoint {
    private final Component component

    FilesEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {

            def queryFiles = {
                requestContext.with {
                    response.contentType = 'application/json'
                    def path = params.required('path', String)
                    def clientDirTree = jsonBody(Map)
                    def files = component.submit(
                        new QueryFiles(
                            path: path,
                            clientDirTree: clientDirTree,
                            username: requestContext.currentUser.username
                        )
                    )
                    send toJson(files)
                }
            }

            error(QueryFailed, InvalidPath) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson([message: it.message]))
            }

            post('/files') {
                queryFiles()
            }

            post('/files/delete') {
                jsonBody(List).forEach {
                    component.submit(
                            new DeleteFile(username: currentUser.username, path: it)
                    )
                }
                response.status = 204
            }

            get('/files/download') {
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

            post('/files/archivable/{path}') {
                def path = URLDecoder.decode(params.required('path', String), "UTF-8")
                component.submit(new SetArchivable(username: currentUser.username, path: path, archivable: true))
                response.status = 204
            }

            post('/files/non-archivable/{path}') {
                def path = URLDecoder.decode(params.required('path', String), "UTF-8")
                component.submit(new SetArchivable(username: currentUser.username, path: path, archivable: false))
                response.status = 204
            }

        }
    }
}
