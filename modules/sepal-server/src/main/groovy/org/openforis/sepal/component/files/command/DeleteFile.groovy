package org.openforis.sepal.component.files.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.files.internal.UserDir
import org.openforis.sepal.util.annotation.Data

@Data
class DeleteFile extends AbstractCommand<Void> {
    String path
}

class DeleteFileHandler implements CommandHandler<Void, DeleteFile> {
    private final File homeDir

    DeleteFileHandler(File homeDir) {
        this.homeDir = homeDir
    }

    Void execute(DeleteFile command) {
        new UserDir(homeDir, command.username).delete(command.path)
        return null
    }
}
