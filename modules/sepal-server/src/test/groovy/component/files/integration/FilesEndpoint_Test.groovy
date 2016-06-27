package component.files.integration

import groovymvc.Controller
import org.openforis.sepal.component.files.endpoint.FilesEndpoint
import org.openforis.sepal.component.files.query.ListFiles
import util.AbstractComponentEndpointTest

@SuppressWarnings("GroovyAssignabilityCheck")
class FilesEndpoint_Test extends AbstractComponentEndpointTest {
    def workingDir = File.createTempDir()

    def cleanup() {
        workingDir.deleteDir()
    }

    void registerEndpoint(Controller controller) {
        new FilesEndpoint(component)
                .registerWith(controller)
    }

    def 'GET /user/files, returns well formatted files'() {
        def expectation = [
                [name: 'a', isDirectory: false, size: 123],
                [name: 'b', isDirectory: true]
        ]

        when:
        get(path: 'user/files', query: [path: '/some-path'])

        then:
        1 * component.submit(new ListFiles(username: testUsername, path: '/some-path')) >> createFiles(expectation)

        sameJson(response.data, expectation)
    }

    List<File> createFiles(List<Map> expectedFiles) {
        expectedFiles.collect {
            def file = new File(workingDir, it.name)
            if (it.isDirectory)
                file.mkdir()
            else {
                def f = new RandomAccessFile(file, "rw")
                f.setLength(it.size)
            }
            return file
        }
    }
}
