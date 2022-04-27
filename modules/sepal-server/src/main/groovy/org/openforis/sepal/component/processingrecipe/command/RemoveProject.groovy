package org.openforis.sepal.component.processingrecipe.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class RemoveProject extends AbstractCommand<Void> {
    String id
}

class RemoveProjectHandler implements CommandHandler<Void, RemoveProject> {
    private final RecipeRepository repository

    RemoveProjectHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(RemoveProject command) {
        repository.removeProject(command.id, command.username)
        return null
    }
}
