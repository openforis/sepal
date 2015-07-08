package org.openforis.sepal.util

import org.slf4j.Logger
import org.slf4j.LoggerFactory

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
}
