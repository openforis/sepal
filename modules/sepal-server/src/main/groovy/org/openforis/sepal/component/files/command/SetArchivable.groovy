package org.openforis.sepal.component.files.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.files.internal.UserDir

@EqualsAndHashCode(callSuper = true)
@Canonical
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
