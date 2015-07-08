package org.openforis.sepal.sceneretrieval.provider

class FileStream {
    final InputStream stream
    final String fileName
    final double fileSizeInBytes

    FileStream(InputStream stream, String fileName, double fileSizeInBytes) {
        this.stream = stream
        this.fileName = fileName
        this.fileSizeInBytes = fileSizeInBytes
    }
}
