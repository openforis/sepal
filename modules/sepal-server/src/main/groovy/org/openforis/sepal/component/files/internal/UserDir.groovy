package org.openforis.sepal.component.files.internal

import org.openforis.sepal.component.files.api.InvalidPath

class UserDir {
    private final File userDir

    UserDir(File homeDir, String username) {
        userDir = new File(homeDir, username).canonicalFile
        if (!userDir.exists())
            throw new InvalidPath("No user directory for user: $username")
    }

    List<File> list(String path) {
        def dir = toUserDirFile(path)
        if (!dir.isDirectory())
            throw new InvalidPath("Path does not point to a directory. userDir: $userDir, dir: $dir")
        return dir.listFiles().toList().sort()
    }

    void delete(String path) {
        def file = toUserDirFile(path)
        if (file == userDir)
            throw new InvalidPath("Cannot delete users dir: $userDir")
        if (file.isDirectory())
            file.deleteDir()
        else
            file.delete()
    }

    InputStream read(String path) {
        def file = toUserDirFile(path)
        if (!file.exists())
            throw new InvalidPath("Path point to a non-existing file. userDir: $userDir, file: $file")
        if (file.isDirectory())
            throw new InvalidPath("Path point to a directory. userDir: $userDir, file: $file")
        return file.newInputStream()
    }

    private File toUserDirFile(String path) {
        def file = new File(userDir, path).canonicalFile
        assertInUserDir(file)
        return file
    }

    private void assertInUserDir(File file) {
        if (!inUserDir(file))
            throw new InvalidPath("Path outside of user directory. userDir: $userDir, file: ${file}")
    }

    private boolean inUserDir(File dir) {
        dir.absolutePath.startsWith(userDir.absolutePath)
    }
}
