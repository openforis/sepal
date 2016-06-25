package org.openforis.sepal.taskexecutor.util

import java.nio.file.Files
import java.nio.file.attribute.UserPrincipal

class FileOwner {
    static void set(File file, String username) {
        file.createNewFile()
        UserPrincipal user = file.toPath().getFileSystem().getUserPrincipalLookupService().lookupPrincipalByName(username)
        Files.setOwner(file.toPath(), user)
    }
}
