package org.openforis.sepal.component.processingrecipe

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.processingrecipe.adapter.JdbcRecipeRepository
import org.openforis.sepal.component.processingrecipe.command.*
import org.openforis.sepal.component.processingrecipe.endpoint.ProcessingRecipeEndpoint
import org.openforis.sepal.component.processingrecipe.migration.*
import org.openforis.sepal.component.processingrecipe.query.ListRecipes
import org.openforis.sepal.component.processingrecipe.query.ListRecipesHandler
import org.openforis.sepal.component.processingrecipe.query.LoadRecipe
import org.openforis.sepal.component.processingrecipe.query.LoadRecipeHandler
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

class ProcessingRecipeComponent extends DataSourceBackedComponent implements EndpointRegistry {
    static final String SCHEMA = 'processing_recipe'
    static final Map<String, Migrations> MIGRATIONS_BY_RECIPE_TYPE = [
        MOSAIC: new MosaicMigrations(),
        CLASSIFICATION: new ClassificationMigrations(),
        CHANGE_DETECTION: new ChangeDetectionMigrations()
    ]

    static ProcessingRecipeComponent create() {
        def connectionManager = SqlConnectionManager.create(DatabaseConfig.fromPropertiesFile(SCHEMA))

        return new ProcessingRecipeComponent(
            connectionManager,
            new AsynchronousEventDispatcher(),
            MIGRATIONS_BY_RECIPE_TYPE,
            new SystemClock()
        )
    }

    ProcessingRecipeComponent(
        SqlConnectionManager connectionManager,
        HandlerRegistryEventDispatcher eventDispatcher,
        Map<String, Migrations> migrationsByRecipeType,
        Clock clock
    ) {
        super(connectionManager, eventDispatcher)
        def repository = new JdbcRecipeRepository(connectionManager)

        command(SaveRecipe, new SaveRecipeHandler(repository, migrationsByRecipeType, clock))
        command(RemoveRecipe, new RemoveRecipeHandler(repository))
        command(MigrateRecipes, new MigrateRecipesHandler(repository))

        query(LoadRecipe, new LoadRecipeHandler(repository))
        query(ListRecipes, new ListRecipesHandler(repository))

    }


    void onStart() {
        MIGRATIONS_BY_RECIPE_TYPE.values().each {
            submit(new MigrateRecipes(migrations: it))
        }

    }

    void registerEndpointsWith(Controller controller) {
        new ProcessingRecipeEndpoint(this).registerWith(controller)
    }
}
