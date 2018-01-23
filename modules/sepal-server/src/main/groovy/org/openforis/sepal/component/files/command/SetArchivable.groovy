package org.openforis.sepal.component.files.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.files.internal.UserDir
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class SetArchivable extends AbstractCommand<Void> {
    String path
    boolean archivable
}

class SetArchivableHandler implements CommandHandler<Void, SetArchivable> {
    private final File homeDir

    SetArchivableHandler(File homeDir) {
        this.homeDir = homeDir
    }

    Void execute(SetArchivable command) {
        def userDir = new UserDir(homeDir, command.username)
        if (!command.archivable)
            userDir.appendToNoArchiveFile(command.path)
        else
            userDir.removeFromNoArchiveFile(command.path)
        return null
    }


}
