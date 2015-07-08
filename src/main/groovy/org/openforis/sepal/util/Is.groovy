package org.openforis.sepal.util

class Is {
    static void notNull(o, String errorMessage = 'Cannot be null') {
        if (o == null)
            throw new IllegalArgumentException(errorMessage)
    }

    static void existingFolder(String folderPath, String errorMessage = 'Is not a valid folder'){
        def file = new File(folderPath)
        existingFolder(file,errorMessage)
    }

    static void existingFolder(File folder, String errorMessage = 'Is not a valid folder'){
        if (! (folder.exists()) || ! (folder.isDirectory())){
            throw new IllegalArgumentException(errorMessage)
        }
    }

    static void existingFile(File file, String errorMessage = 'Is not a valid file'){
        if (! (file.exists()) || ! (file.isFile())){
            throw new IllegalArgumentException(errorMessage)
        }
    }

    static void existingFile(String filePath, String errorMessage = 'Is not a valid file'){
        File file = new File(filePath)
        existingFile(file)
    }
}
