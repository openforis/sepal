package component.files

import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.files.api.InvalidPath
import org.openforis.sepal.component.files.api.UserFile
import org.openforis.sepal.component.files.command.SetArchivable

class SetArchivable_Test extends AbstractFilesTest {
    def 'When file not tagged as non-archivable, file list has it archivable'() {
        addFile('/test.txt')

        expect:
        archivable('/test.txt')
    }


    def 'When file tagged as non-archivable, file list has it non-archivable'() {
        addFile('/test.txt')

        when:
        setNonArchivable('/test.txt')

        then:
        !archivable('/test.txt')
    }

    private void setArchivable(String path) {
        component.submit(new SetArchivable(username: testUsername, path: path, archivable: true))
    }

    private void setNonArchivable(String path) {
        component.submit(new SetArchivable(username: testUsername, path: path, archivable: false))
    }

    def 'When files tagged as non-archivable, file list has them non-archivable'() {
        addFile('/test1.txt')
        addFile('/test2.txt')

        when:
        setNonArchivable('/test1.txt')
        setNonArchivable('/test2.txt')

        then:
        !archivable('/test1.txt')
        !archivable('/test2.txt')
    }

    def 'When directory tagged as non-archivable, files within are non-archivable'() {
        addFile('/test-dir/test.txt')

        when:
        setNonArchivable('/test-dir')

        then:
        !archivable('/test-dir/test.txt')
    }

    def 'When file is toggled from non-archivable to archivable, file is archivable'() {
        addFile('/test.txt')
        setNonArchivable('/test.txt')

        when:
        setArchivable('/test.txt')

        then:
        archivable('/test.txt')
    }


    def 'Given dir with non-archivable file, when directory is toggled from non-archivable to archivable, file within is archivable'() {
        addFile('/test-dir/test.txt')
        setNonArchivable('/test-dir/test.txt')

        when:
        setNonArchivable('/test-dir')
        setArchivable('/test-dir')

        then:
        archivable('/test-dir/test.txt')
    }

    def 'If file is hidden, it should not be archived' () {
        addFile('/.hidden-file')

        expect:
        !archivable('.hidden-file')
    }

    def 'When setting a file non-archivable outside user directory, exception is thrown'() {
        when:
        setNonArchivable('/../../test.txt')

        then:
        def e = thrown(ExecutionFailed)
        e.cause instanceof InvalidPath
    }

    def 'When setting a file archivable outside user directory, exception is thrown'() {
        when:
        setArchivable('/../../test.txt')

        then:
        def e = thrown(ExecutionFailed)
        e.cause instanceof InvalidPath
    }

    private boolean archivable(String relativePath) {
        userFile(relativePath).archivable
    }

    private UserFile userFile(String relativePath) {
        def path = new File(new File(homeDir, testUsername), relativePath).path
        listFiles(new File(relativePath).parent ?: '/').find { it.path == path }
    }
}
