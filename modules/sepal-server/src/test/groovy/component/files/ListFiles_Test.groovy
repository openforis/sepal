package component.files

import org.openforis.sepal.query.QueryFailed

class ListFiles_Test extends AbstractFilesTest {
    def 'Given no files, when listing root, no files are returned'() {
        when:
        def files = listFiles('/')

        then:
        files.empty
    }

    def 'Given a file in root, when listing root, file is returned'() {
        def file = addFile('file.txt')

        when:
        def files = listFiles('/')

        then:
        files == [file]
    }

    def 'Given a file in root, when listing empty path, file is returned'() {
        def file = addFile('file.txt')

        when:
        def files = listFiles('')

        then:
        files == [file]
    }

    def 'Given a file in directory, when listing directory, file is returned'() {
        def file = addFile('/dir/file.txt')

        when:
        def files = listFiles('/dir')

        then:
        files == [file]
    }

    def 'Given a file, when listing the file, exception is thrown'() {
        addFile('/dir/file.txt')

        when:
        listFiles('/file.txt')

        then:
        thrown QueryFailed
    }

    def 'Given a user without user dir, when listing root, exception is thrown'() {
        when:
        listFiles('/', 'non-existing-user')

        then:
        thrown QueryFailed
    }

    def 'When listing path outside of home dir, exception is thrown'() {
        when:
        listFiles('../..')

        then:
        thrown QueryFailed
    }
}
