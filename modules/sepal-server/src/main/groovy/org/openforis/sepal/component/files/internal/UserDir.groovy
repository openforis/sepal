package org.openforis.sepal.component.files.internal

import org.openforis.sepal.component.files.api.InvalidPath
import org.openforis.sepal.component.files.api.UserFile

class UserDir {
    private final File userDir
    private final File noArchiveFile

    UserDir(File homeDir, String username) {
        userDir = new File(homeDir, username).canonicalFile
        if (!userDir.exists())
            throw new InvalidPath("No user directory for user: $username")
        noArchiveFile = new File(userDir, '.no-archive')
    }

    List<UserFile> list(String path) {
        def dir = toUserDirFile(path)
        if (!dir.isDirectory())
            throw new InvalidPath("Path does not point to a directory. userDir: $userDir, dir: $dir")
        def noArchivePaths = getNoArchivePaths()
        return dir.listFiles().toList().sort().collect {
            UserFile.fromFile(it, isArchivable(it, noArchivePaths))
        }
    }

    private String toUserDirPath(File file) {
        '/' + userDir.toURI().relativize(file.toURI()).path
    }

    private boolean isArchivable(File file, List<String> noArchivePaths) {
        def relativePath = toUserDirPath(file)
        if (file.name.startsWith('.'))
            return false
        def archivable = !noArchivePaths.find {
            startsWith(relativePath, it)
        }
        return archivable
    }

    boolean startsWith(String path1, String path2) {
        path1 = new File(path1).toPath()
        path2 = new File(path2).toPath()
        return path1.startsWith(path2)
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

    void appendToNoArchiveFile(String path) {
        assertInUserDir(toUserDirFile(path))
        if (!noArchiveFile.exists())
            noArchiveFile.createNewFile()
        def lines = getNoArchivePaths()
        lines.removeAll {
            startsWith(it, path)
        }
        lines.add(path)
        lines.sort()
        noArchiveFile.setText(lines.join('\n'), 'UTF-8')
    }

    void removeFromNoArchiveFile(String path) {
        assertInUserDir(toUserDirFile(path))
        def lines = getNoArchivePaths()
        lines.removeAll {
            it == path
        }
        noArchiveFile.setText(lines.join('\n'), 'UTF-8')
    }

    private List<String> getNoArchivePaths() {
        if (noArchiveFile.size() > 1e6)
            throw new IllegalStateException("${noArchiveFile} is too big: ${(int) (noArchiveFile.size() / 1024)} KB")
        noArchiveFile.exists() ? noArchiveFile.readLines('UTF-8') : []
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
