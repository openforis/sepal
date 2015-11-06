package unit.util

import org.openforis.sepal.util.Is
import spock.lang.Specification

class IsTest extends Specification {
    static final String A_FILE_PATH = "/path/to/file"

    def 'given a non existing folder the Exception message containt its path'() {
        File folder = new File(A_FILE_PATH)
        when:
            Is.existingFolder(folder)
        then:
            Exception e = thrown(IllegalArgumentException)
            e.getMessage().contains(folder.absolutePath)
    }

    def 'given a non existing file the Exception message containt its path'() {
        File file = new File(A_FILE_PATH)
        when:
            Is.existingFile(file)
        then:
            Exception e = thrown(IllegalArgumentException)
            e.getMessage().contains(file.absolutePath)
    }

    def 'given a null path, the null value is correctly handled and no NullPointerException are thrown'() {
        File file = new File(A_FILE_PATH)
        when:
            Is.existingFile(null)
            Is.existingFolder(null)
        then:
            thrown(IllegalArgumentException)
    }
}
