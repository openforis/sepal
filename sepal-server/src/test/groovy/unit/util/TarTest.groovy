package unit.util

import org.openforis.sepal.util.Tar
import spock.lang.Ignore
import spock.lang.Specification

import java.nio.file.Files


class TarTest extends Specification {
    File workingDir = File.createTempDir()

    def cleanup() {
        workingDir.deleteDir()
    }

    def 'Can unpack a .tar.gz file'() {
        def archive = createArchive('archive.tar.gz')

        when:
            Tar.unpackTarGz(archive)

        then:
            workingDir.list() as List == ['1.tif', '2.tif']
    }

    def 'Unpacking archive with other extension than .tar.gz throws IllegalArgumentException'() {
        def archive = createArchive('archive.tar.gz.another')

        when:
            Tar.unpackTarGz(archive)

        then:
            thrown(IllegalArgumentException)
    }

    def 'Unpacking invalid archive throws IOException'() {
        def archive = new File(workingDir, 'archive.tar.gz')
        archive.write('Not an archive')

        when:
            Tar.unpackTarGz(archive)

        then:
            thrown(IOException)
    }

    private File createArchive(String fileName) {
        def archive = new File(workingDir, fileName)
        Files.copy(getClass().getResourceAsStream('/scene.tar.gz'), archive.toPath())
        return archive
    }
}
