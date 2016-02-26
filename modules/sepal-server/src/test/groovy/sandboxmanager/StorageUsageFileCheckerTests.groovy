package sandboxmanager

import org.openforis.sepal.component.sandboxmanager.StorageUsageFileChecker
import spock.lang.Specification

class StorageUsageFileCheckerTests extends Specification {
    def workingDir = File.createTempDir()
    def checker = new StorageUsageFileChecker(workingDir.absolutePath + '/%user%')
    def userHome = new File(workingDir, 'some-username')

    def setup() {
        userHome.mkdirs()
    }

    def cleanup() {
        workingDir.deleteDir()
    }

    def 'Given non-existing user, when determining usage, exception is thrown'() {
        when:
        checker.determineUsage('non-existing-user')

        then:
        thrown Exception
    }

    def 'Given usage file, size specified in GB is returned'() {
        usageFile("12\t$userHome")

        when:
        def usage = checker.determineUsage('some-username')

        then:
        usage == kbToGb(12)
    }

    def 'Given no usage file, 0 is returned'() {
        when:
        def usage = checker.determineUsage('some-username')

        then:
        usage == 0d
    }

    private double kbToGb(long size) {
        size / 1000d / 1000d
    }

    private void usageFile(String contents) {
        def file = new File(userHome, '.storageUsed')
        file.write(contents)
    }
}
