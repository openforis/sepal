package org.openforis.sepal.component.processingrecipe.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.processingrecipe.api.RecipeRepository
import org.openforis.sepal.component.processingrecipe.migration.Migrations
import org.openforis.sepal.util.Clock

@EqualsAndHashCode(callSuper = true)
@Canonical
class SaveProject extends AbstractCommand<Void> {
    Map project
}

class SaveProjectHandler implements CommandHandler<Void, SaveProject> {
    private final RecipeRepository repository

    SaveProjectHandler(RecipeRepository repository) {
        this.repository = repository
    }

    Void execute(SaveProject command) {
        repository.saveProject(command.project)
        return null
    }
}
