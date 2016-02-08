package org.openforis.sepal.util


interface ResourceLocator {
    def download(String resourceURI, Closure callback)
}

class HttpResourceLocator implements ResourceLocator {

    def download(String resourceURI, Closure callback) {
        Is.notNull(resourceURI)
        URL url = new URL(resourceURI)
        url.withInputStream {
            callback(it)
        }
    }
}


