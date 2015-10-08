package org.openforis.sepal.util

class Is {

    private final static String DEFAULT_ERROR_MESSAGE = " Is not a valid path"

    static void notNull(o, String errorMessage = 'Cannot be null') {
        if (o == null)
            throw new IllegalArgumentException(errorMessage)
    }

    static void existingFolder(File folder, String errorMessage = DEFAULT_ERROR_MESSAGE) {
        if (errorMessage == DEFAULT_ERROR_MESSAGE && folder != null){
            if (folder != null){
                errorMessage = folder.absolutePath + errorMessage
            }
        }
        if (!(folder?.exists()) || !(folder?.isDirectory())) {
            throw new IllegalArgumentException(errorMessage)
        }
    }

    static void existingFile(File file, String errorMessage = DEFAULT_ERROR_MESSAGE) {
        if (errorMessage == DEFAULT_ERROR_MESSAGE && file != null){
            if (file != null){
                errorMessage = file.absolutePath + errorMessage
            }
        }
        if (!(file?.exists()) || !(file?.isFile())) {
            throw new IllegalArgumentException(errorMessage)
        }
    }

}
