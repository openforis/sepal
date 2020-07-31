package org.openforis.sepal.component.apps.endpoint

import groovymvc.Controller
import org.openforis.sepal.component.Component

import javax.servlet.http.HttpServletRequest
import javax.servlet.http.HttpServletResponse
import java.text.SimpleDateFormat

import static groovy.json.JsonOutput.toJson

class AppsEndpoint {
    private final Component component
    private final File appsFile

    AppsEndpoint(Component component, File appsFile) {
        this.component = component
        this.appsFile = appsFile
    }

    void registerWith(Controller controller) {
        controller.with {
            get('/apps') {
                response.contentType = "application/json"
                sendFile(appsFile, request, response)
            }

            get('/apps/image/{filename}') {
                def filename = params.required('filename', String)
                def image = new File(new File(appsFile.parent, 'images'), filename)
                if (image.exists()) {
                    try {
                        response.contentType = imageContentType(image)
                        sendFile(image, request, response)
                    } catch (IllegalArgumentException e) {
                        response.status = 400
                        send(toJson([message: e.message]))
                    }
                } else {
                    response.status = 400
                    send(toJson([message: 'Image not found: ' + filename]))
                }
            }
        }
    }

    static void sendFile(File file, HttpServletRequest request, HttpServletResponse response) {
        def format = new SimpleDateFormat('EEE, dd MMM yyyy HH:mm:ss zzz')
        def lastModifiedDate = new Date(file.lastModified())
        def lastModified = format.format(lastModifiedDate)
        response.addHeader('Last-Modified', lastModified)
        response.addHeader('Cache-Control', 'max-age=10, must-revalidate')
        def ifModifiedSince = request.getHeader('If-Modified-Since')
        if (ifModifiedSince && !lastModifiedDate.after(format.parse(ifModifiedSince))) {
            response.status = 304
        } else {
            file.withInputStream { stream -> response.outputStream << stream }
        }
    }

    static String imageContentType(File image) {
        def extension = image.name[image.name.lastIndexOf('.')..-1].toLowerCase()
        switch (extension) {
            case '.png': return 'image/png'
            case '.jpg': return 'image/jpeg'
            case '.svg': return 'image/svg+xml'
            default: throw new IllegalArgumentException('Unsupported image extension: ' + extension)
        }
    }
}
