package component.workersession

class RemoveOrphanedTmpDirs_Test extends AbstractWorkerSessionTest {
    def userTmp = new File(workDir, "$testUsername/tmp")

    def setup() {
        userTmp.mkdirs()
    }

    def 'With no session, tmp dir is removed'() {
        def tmpDir = createSessionTmpDir('some-instance-id')

        when:
        removeOrphanedTmpDirs()

        then:
        userTmp.exists()
        !tmpDir.exists()
    }

    def 'With a session, session tmp dir is not removed'() {
        def session = activeSession()
        def tmpDir = createSessionTmpDir(session.instance.id)

        when:
        removeOrphanedTmpDirs()

        then:
        tmpDir.exists()
    }

    def 'With a session for another user, session tmp dir is removed'() {
        def session = activeSession(username: 'another-user')
        def tmpDir = createSessionTmpDir(session.instance.id)

        when:
        removeOrphanedTmpDirs()

        then:
        !tmpDir.exists()
    }

    private File createSessionTmpDir(String instanceId) {
        def tmpDir = new File(userTmp, instanceId)
        tmpDir.mkdir()
        tmpDir
    }
}
