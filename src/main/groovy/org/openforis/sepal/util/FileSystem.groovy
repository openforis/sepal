package org.openforis.sepal.util

import org.apache.commons.io.FileUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.nio.file.Files

class FileSystem {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    public static File toDir(String path) {
        def dir = toFile(path)
        if (!dir.isDirectory())
            illegalArgument("$dir is not a directory")
        return dir
    }

    public static File toFile(String path) {
        def file = new File(path)
        if (!file.exists())
            illegalArgument("$file does not exist")
        return file
    }

    private static void illegalArgument(String error) {
        LOG.error(error)
    }

    public static Double getFileSize(File file) {
        Is.notNull(file)
        return file.isFile() ? Files.size(file.toPath()) : FileUtils.sizeOfDirectory(file)
    }


}
