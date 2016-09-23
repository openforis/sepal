package org.openforis.sepal.util

import org.apache.commons.io.FileUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.nio.file.Files

class FileSystem {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    static File toDir(String path) {
        def dir = toFile(path)
        if (!dir.isDirectory())
            illegalArgument("$dir is not a directory")
        return dir
    }

    static File toFile(String path) {
        def file = new File(path)
        if (!file.exists())
            illegalArgument("$file does not exist")
        return file
    }

    static void mkDirs(File dir) {
        if (!(dir.exists())) {
            boolean created = dir.mkdirs()
            if (!(created)) {
                throw new RuntimeException("Unable to create directory $dir.absolutePath. Please check permissions on server")
            }
        }
    }

    static void deleteDirContent(File dir, Boolean recursive = true) {
        dir.eachFile {
            if (it.isDirectory() && recursive) {
                FileUtils.deleteDirectory(it)
            } else if (it.isFile()) {
                FileUtils.forceDelete(it)
            }
        }
    }

    static String removeFileExtension(String fileName) {
        fileName.replaceFirst('[.][^.]+$', '')
    }

    private static void illegalArgument(String error) {
        LOG.error(error)
    }

    static Double getFileSize(File file) {
        Is.notNull(file)
        return file.isFile() ? Files.size(file.toPath()) : FileUtils.sizeOfDirectory(file)
    }

    static File configDir() {
        new File(System.getProperty('configDir') ?: '/etc/sepal/')
    }

}
