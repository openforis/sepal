package org.openforis.sepal.component.processingrecipe

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.processingrecipe.adapter.JdbcRecipeRepository
import org.openforis.sepal.component.processingrecipe.command.*
import org.openforis.sepal.component.processingrecipe.endpoint.ProcessingRecipeEndpoint
import org.openforis.sepal.component.processingrecipe.migration.*
import org.openforis.sepal.component.processingrecipe.query.*
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
        RADAR_MOSAIC: new RadarMosaicMigrations(),
        CLASSIFICATION: new ClassificationMigrations(),
        CHANGE_DETECTION: new ChangeDetectionMigrations(),
        TIME_SERIES: new TimeSeriesMigrations(),
        CCDC: new CcdcMigrations(),
        CCDC_SLICE: new CcdcSliceMigrations(),
        REMAPPING: new RemappingMigrations(),
        CHANGE_ALERTS: new ChangeAlertsMigrations(),
        PHENOLOGY: new PhenologyMigrations(),
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
        command(RemoveRecipes, new RemoveRecipesHandler(repository))
        command(MigrateRecipes, new MigrateRecipesHandler(repository))
        command(SaveProject, new SaveProjectHandler(repository))
        command(RemoveProject, new RemoveProjectHandler(repository))
        command(MoveRecipes, new MoveRecipesHandler(repository))

        query(LoadRecipe, new LoadRecipeHandler(repository))
        query(ListRecipes, new ListRecipesHandler(repository))
        query(ListProjects, new ListProjectsHandler(repository))

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
