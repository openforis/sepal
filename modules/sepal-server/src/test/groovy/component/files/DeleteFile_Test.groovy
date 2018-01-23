package component.files

import org.openforis.sepal.command.ExecutionFailed

class DeleteFile_Test extends AbstractFilesTest {
    def 'Given path points to file, when executing, file is deleted'() {
        def file = addFile('/dir/file.txt')

        when:
        deleteFile('/dir/file.txt')

        then:
        !file.exists()
    }

    def 'Given path points to dir, when executing, dir is deleted'() {
        def file = addFile('/dir/file.txt')
        def dir = new File(file.path).parentFile

        when:
        deleteFile('/dir')

        then:
        !dir.exists()
    }

    def 'Given path to homDir, when executing, exception is thrown'() {
        when:
        deleteFile('/')

        then:
        thrown ExecutionFailed
        homeDir.exists()
    }

    def 'Given a user without user dir, when executing, exception is thrown'() {
        when:
        deleteFile('/', 'non-existing-user')

        then:
        thrown ExecutionFailed
    }

    def 'Given path outside of home dir, when executing, exception is thrown'() {
        when:
        deleteFile('../..')

        then:
        thrown ExecutionFailed
    }
}
