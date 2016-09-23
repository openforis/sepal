package unit.util

import org.openforis.sepal.util.CsvInputStreamReader
import spock.lang.Specification

class CsvInputStreamReaderTest extends Specification {
    def workingDir = File.createTempDir()

    def cleanup() {
        workingDir.deleteDir()
    }

    def 'Given one data line, one line is returned'() {
        expect:
        lines('a', 'value').size() == 1
    }

    def 'Given one data line, one map wih value by column name is returned'() {
        expect:
        lines('a', 'value').first() == [a: 'value']
    }

    def 'Given two columns, two map wih value by column name is returned'() {
        expect:
        lines('a, b', 'value a, value b').first() == [a: 'value a', b: 'value b']
    }

    def 'Given two lines, both can be reade'() {
        expect:
        lines('a', 'value 1', 'value 2').size() == 2
    }

    def 'Given two lines, iteration can be canceled after first line'() {
        expect:

        lines(['a', 'value 1', 'value 2']) {
            return false
        }.size() == 1
    }

    private List lines(String... lines) {
        def readLines = []
        writeFile(lines).withInputStream {
            new CsvInputStreamReader(it).eachLine { readLines << it }
        }
        return readLines
    }

    private List lines(List lines, Closure callback) {
        def readLines = []
        writeFile(lines as String[]).withInputStream {
            new CsvInputStreamReader(it).eachLine {
                readLines << it
                callback.call(it)
            }
        }
        return readLines
    }


    File writeFile(String... lines) {
        def file = new File(workingDir, 'test.csv')
        file.withWriter { writer ->
            lines.each { writer.write(it + '\n') }
        }
        return file
    }
}
