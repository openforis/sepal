package component.files

import org.openforis.sepal.query.QueryFailed

import java.nio.file.Files

class ReadFile_Test extends AbstractFilesTest {
    def 'When reading file, file content is read'() {
        def file = addFile('file.txt')

        when:
        def fileContent = readFile('file.txt')

        then:
        fileContent == file.text
    }

    def 'When reading non-existing file, exception is thrown'() {
        when:
        readFile('non-existing-file')

        then:
        thrown QueryFailed
    }

    def 'When reading a directory, exception is thrown'() {
        addDir('dir')
        when:
        readFile('dir')

        then:
        thrown QueryFailed
    }

    def 'When reading a file outside of home dir, exception is thrown'() {
        def file = File.createTempFile('outside-of-user-home', '.txt')
        def relativePath = testUserHomeDir.toPath().relativize(file.toPath()).toString()

        when:
        readFile(relativePath)

        then:
        thrown QueryFailed
    }
}
