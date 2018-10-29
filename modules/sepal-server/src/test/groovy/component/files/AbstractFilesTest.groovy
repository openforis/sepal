package component.files

import org.openforis.sepal.component.files.FilesComponent
import org.openforis.sepal.component.files.api.UserFile
import org.openforis.sepal.component.files.command.DeleteFile
import org.openforis.sepal.component.files.query.ListFiles
import org.openforis.sepal.component.files.query.QueryFiles
import org.openforis.sepal.component.files.query.ReadFile
import spock.lang.Specification

abstract class AbstractFilesTest extends Specification {
    final File homeDir = File.createTempDir()
    final component = new FilesComponent(homeDir)
    final String testUsername = System.getProperty('user.name')
    final File testUserHomeDir = createUserHome(testUsername)

    def setup() {
        testUserHomeDir.mkdirs()
    }

    def cleanup() {
        homeDir.deleteDir()
    }

    final List<UserFile> listFiles(String path, String username = testUsername) {
        component.submit(new ListFiles(username: username, path: path))
    }

    final void deleteFile(String path, String username = testUsername) {
        component.submit(new DeleteFile(username: username, path: path))
    }

    final String readFile(String path, String username = testUsername) {
        component.submit(new ReadFile(username: username, path: path)).text
    }

    final File createUserHome(String username) {
        new File(homeDir, username)
    }

    final Map query(String path, Map clientDirTree = [:], String username = testUsername) {
        component.submit(new QueryFiles(path: path, clientDirTree: clientDirTree, username: username))
    }

    final UserFile addFile(String relativePath, String username = testUsername) {
        def file = new File(new File(homeDir, username), relativePath)
        file.parentFile.mkdirs()
        file.write(file.name)
        return UserFile.fromFile(file.canonicalFile)
    }

    final File addDir(String relativePath, String username = testUsername) {
        def dir = new File(new File(homeDir, username), relativePath)
        dir.mkdirs()
        return dir.canonicalFile
    }
}
