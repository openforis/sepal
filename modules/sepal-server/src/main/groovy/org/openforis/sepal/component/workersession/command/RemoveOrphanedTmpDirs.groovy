package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository

import static org.openforis.sepal.component.workersession.api.WorkerSession.State.ACTIVE
import static org.openforis.sepal.component.workersession.api.WorkerSession.State.PENDING

class RemoveOrphanedTmpDirs extends AbstractCommand<Void> {
}

class RemoveOrphanedTmpDirsHandler implements CommandHandler<Void, RemoveOrphanedTmpDirs> {
    private final File homeDir
    private final WorkerSessionRepository sessionRepository

    RemoveOrphanedTmpDirsHandler(File homeDir, WorkerSessionRepository sessionRepository) {
        this.homeDir = homeDir
        this.sessionRepository = sessionRepository
    }

    Void execute(RemoveOrphanedTmpDirs command) {
        def sessions = sessionRepository.sessions([PENDING, ACTIVE])

        def noInstanceWithSameUser = { File instanceDir ->
            def username = instanceDir.parentFile.parentFile.name
            !sessions.find {
                it.instance.id == instanceDir.name &&
                        it.username == username
            }
        }
        homeDir.listFiles()
                .findAll { it.isDirectory() }
                .collect { userDir -> new File(userDir, 'tmp') }
                .findAll { tmp -> tmp.isDirectory() }
                .collect { tmpDir -> tmpDir.listFiles() }.flatten()
                .findAll { tmpFile -> tmpFile.isDirectory() }
                .findAll { instanceDir -> noInstanceWithSameUser(instanceDir) }
                .each { instanceDir -> instanceDir.deleteDir() }
        return null
    }
}

