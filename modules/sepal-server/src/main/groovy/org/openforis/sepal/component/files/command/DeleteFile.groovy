package org.openforis.sepal.component.files.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.files.internal.UserDir
import org.openforis.sepal.event.Topic

@EqualsAndHashCode(callSuper = true)
@Canonical
class DeleteFile extends AbstractCommand<Void> {
    String path
}

class DeleteFileHandler implements CommandHandler<Void, DeleteFile> {
    private final File homeDir
    private Topic publishTopic

    DeleteFileHandler(File homeDir, Topic publishTopic) {
        this.publishTopic = publishTopic
        this.homeDir = homeDir
    }

    Void execute(DeleteFile command) {
        new UserDir(homeDir, command.username).delete(command.path)
        publishTopic.publish([username: command.username, path: command.path], 'FilesDeleted')
        return null
    }
}
