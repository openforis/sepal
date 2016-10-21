package org.openforis.sepal.taskexecutor.util

import java.nio.file.Files
import java.nio.file.attribute.UserPrincipal

class FileOwner {
    /**
     * Sets ownership of file.
     * If parent directories doesn't exist, they are created with same ownership.
     * If file doesn't exist, a new file is created.
     * @param file the file or directory to set owner of
     * @param username the username to set
     */
    static void set(File file, String username) {
        if (!file.parentFile.exists())
            setOnDir(file.parentFile, username)
        if (!file.exists())
            if (!file.createNewFile())
                throw new IOException("Failed to create file " + file)
        UserPrincipal user = file.toPath().getFileSystem().getUserPrincipalLookupService()
                .lookupPrincipalByName(username)
        Files.setOwner(file.toPath(), user)
    }

    static void setOnDir(File dir, String username) {
        if (!dir.parentFile.exists())
            setOnDir(dir.parentFile, username)
        if (!dir.mkdir())
            throw new IOException("Failed to created directory " + dir)
        set(dir, username)
    }
}
