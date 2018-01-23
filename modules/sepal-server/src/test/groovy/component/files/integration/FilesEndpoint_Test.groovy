package component.files.integration

import groovymvc.Controller
import org.openforis.sepal.component.files.api.InvalidPath
import org.openforis.sepal.component.files.api.UserFile
import org.openforis.sepal.component.files.command.DeleteFile
import org.openforis.sepal.component.files.endpoint.FilesEndpoint
import org.openforis.sepal.component.files.query.ListFiles
import org.openforis.sepal.component.files.query.ReadFile
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryFailed
import org.openforis.sepal.query.QueryHandler
import spock.lang.Unroll
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
                [name: 'a', isDirectory: false, size: 123, archivable: true],
                [name: 'b', isDirectory: true, archivable: true]
        ]

        when:
        get(path: 'user/files', query: [path: '/some-path'])

        then:
        1 * component.submit(new ListFiles(username: testUsername, path: '/some-path')) >> createFiles(expectation)

        sameJson(response.data, expectation)
    }

    def 'GET /user/files, a non-existing path returns 400'() {
        def query = new ListFiles(username: testUsername, path: '/non-existing-path')
        failQuery(query, new InvalidPath('Non-existing path'))

        when:
        get(path: 'user/files', query: [path: query.path])

        then:
        response.status == 400
    }

    def 'GET /user/files/download, returns file'() {
        when:
        get(path: 'user/files/download', query: [path: '/some-file'])

        then:
        1 * component.submit(new ReadFile(username: testUsername, path: '/some-file')) >> createFile('some-file')

        response.data.text == 'some-file'
        response.getFirstHeader('Content-disposition')?.value?.contains('some-file')
    }

    @Unroll
    def 'GET /user/files/download, "#path" has content-type "#contentType"'() {
        component.submit(new ReadFile(username: testUsername, path: path)) >> createFile(path)

        when:
        get(path: 'user/files/download', query: [path: path])

        then:
        response.contentType == contentType

        where:
        path                         | contentType
        'foo.unrecognized/extension' | 'application/octet-stream'
        'no-extension'               | 'application/octet-stream'
        'foo.txt'                    | 'text/plain'
        'foo.tif'                    | 'image/tiff'
        '/in/directory.tif'          | 'image/tiff'
    }

    def 'GET /user/files/download, a non-existing file returns 400'() {
        def query = new ReadFile(username: testUsername, path: '/non-existing-path')
        failQuery(query, new InvalidPath('Non-existing path'))

        when:
        get(path: 'user/files/download', query: [path: query.path])

        then:
        response.status == 400
    }


    def 'DELETE /user/files/some-file, file is deleted'() {
        when:
        def response = delete(path: 'user/files/some-file')

        then:
        1 * component.submit(new DeleteFile(username: testUsername, path: '/some-file'))
        response.status == 200
    }

    void failQuery(Query query, Throwable cause) {
        component.submit(query) >> { throw new QueryFailed({} as QueryHandler, query, cause) }
    }

    List<File> createFiles(List<Map> expectedFiles) {
        expectedFiles.collect {
            def file = new File(workingDir, it.name)
            file.parentFile.mkdirs()
            if (it.isDirectory)
                file.mkdir()
            else {
                def f = new RandomAccessFile(file, "rw")
                f.setLength(it.size)
            }
            return UserFile.fromFile(file)
        }
    }

    InputStream createFile(String path) {
        def file = new File(workingDir.absolutePath + path)
        file.parentFile.mkdirs()
        file.write(path)
        return file.newInputStream()
    }
}
