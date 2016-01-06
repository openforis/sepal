package org.openforis.sepal.util

class FilePermissions {

    static void readWritableRecursive(File dir) {
        readWritable(dir)
        dir.eachFileRecurse { file ->
            println file
            readWritable(file)
        }
    }

    private static void readWritable(File file) {
        if (file.isDirectory())
            file.setExecutable(true, true)
        file.setReadable(true, false)
        file.setWritable(true, false)
    }
}
