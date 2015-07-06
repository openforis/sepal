package org.openforis.sepal.geoserver

import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.TEXT
import static groovyx.net.http.ContentType.XML

class RestGeoServer implements GeoServer {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final RESTClient server
    private final String style

    RestGeoServer(String style, String serverUrl, String userName, String password) {
        LOG.info("Creating RestGeoServer at $serverUrl")
        server = new RESTClient(serverUrl)
        server.auth.basic(userName, password)
        this.style = style
    }

    void addWorkspace(String user) {
        LOG.debug("Checking workspace for $user")
        try {
            if (exists("$server.defaultURI/rest/workspaces/${user}.xml"))
                LOG.debug("Workspace for $user already exists")
            else {
                LOG.debug("Workspace on GeoServer does not exist. Going to create it")
                def path = "$server.defaultURI/rest/workspaces/"
                def body = "<workspace><name>$user</name></workspace>"
                LOG.trace("Making a post request to $path with body $body")
                server.post(
                        path: path,
                        requestContentType: XML,
                        body: body
                )
            }
        } catch (Exception ex) {
            LOG.error("Error during workspace adding", ex)
        }


    }

    void removeWorkspace(String user) {
        def path = "$server.defaultURI/rest/workspaces/${user}"
        try {
            if (!(exists("$path" + '.xml'))) {
                LOG.debug("Workspace for $user does not exists")
            } else {
                server.delete(path: path, query: [recurse: true])
            }
        } catch (HttpResponseException e) {
            LOG.error("Error during workspace removal", e)
        }

    }

    void publishStore(String user, File dir) {
        LOG.debug("Publishing store $dir for $user")
        def layerName = dir.name
        try {
            def path = "$server.defaultURI/rest/workspaces/$user/coveragestores/$layerName/external.imagemosaic"
            def body = "file://$dir.absolutePath"
            LOG.trace("Going to create a PUT request at $path with body $body")
            server.put(
                    path: path,
                    requestContentType: TEXT,
                    body: body
            )
            LOG.trace("Request succesfully served")
        } catch (HttpResponseException e) {
            LOG.error("Error during store publishing", e)
        }
    }

    void publishLayer(String user, File dir) {
        LOG.debug("Publishing layer $dir for $user")
        def layerName = dir.name
        if (!exists("$server.defaultURI/rest/layers/$layerName"))
            try {
                LOG.debug("Layer $dir does not exist on GeoServer")
                publishStore(user, dir)
                def path = "$server.defaultURI/rest/layers/$user:${layerName}.xml"
                def body = "<layer><defaultStyle><name>" + style + "</name></defaultStyle></layer>"
                LOG.trace("Goint to create a PUT request at $path with body $body")
                server.put(
                        path: path,
                        requestContentType: XML,
                        body: body
                )
                LOG.trace("Request Succesfully Served")
            } catch (HttpResponseException e) {
                LOG.error("Error during layer publishing", e)
            }
    }

    void removeLayer(String user, String layerName) {
        LOG.debug("Going to remove layer $user:$layerName")
        try {
            if (!exists("$server.defaultURI/rest/layers/$layerName")) {
                LOG.warn("Layer $user:layerName does not exist. Impossible to proceed further")
            } else {
                def path = "$server.defaultURI/rest/workspaces/$user/coveragestores/$layerName"
                LOG.trace("Going to create a DELETE request at $path")
                server.delete(path: path, query: [recurse: true])
                LOG.debug("Layer succesfully deleted")
            }
        } catch (Exception ex) {
            LOG.error("Error during layer deletion", e)
        }

    }


    private boolean exists(String path) {
        try {
            LOG.trace("Going to check whether the resource exist on GeoServer. $path")
            server.get(path: path, query: [quietOnNotFound: true])
            LOG.trace("Resource exist")
            return true
        } catch (HttpResponseException ignore) {
            LOG.trace("Resource does not exist")
            return false
        }
    }
}
