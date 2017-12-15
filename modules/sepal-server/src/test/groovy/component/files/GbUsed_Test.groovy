package component.files

import org.openforis.sepal.component.files.query.GbUsed

class GbUsed_Test extends AbstractFilesTest {
    def 'Given a file in the home directory, some storage is used'() {
        addFile('file.txt')

        when:
        def gb = component.submit(new GbUsed(testUsername))

        then:
        gb > 0
        gb < 0.00001
    }

    def 'Two files take use more storage than one file'() {
        addFile('file.txt')
        def gbWithOneFile = component.submit(new GbUsed(testUsername))
        addFile('file2.txt')

        when:
        def gbWithTwoFiles = component.submit(new GbUsed(testUsername))

        then:
        gbWithOneFile < gbWithTwoFiles
    }
}
