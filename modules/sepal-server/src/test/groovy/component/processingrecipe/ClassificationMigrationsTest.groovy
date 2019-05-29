package component.processingrecipe

import groovy.json.JsonOutput
import org.openforis.sepal.component.processingrecipe.command.MigrateRecipes
import org.openforis.sepal.component.processingrecipe.migration.ClassificationMigrations
import spock.lang.Ignore
import spock.lang.Unroll

@Ignore
class ClassificationMigrationsTest extends RecipeTest {

    def 'Test with mosaic references'() {
        def recipe = saveRecipe(newRecipe(contents: '''
            {
                "id": "recipe-id",
                "type": "CLASSIFICATION",
                "name": "classification-title",
                "inputRecipe": "mosaic-id",
                "fusionTableId": "fusion-table-id",
                "fusionTableClassColumn": "class",
                "algorithm": "cart",
                "aoiCode": null,
                "aoiName": null,
                "polygon": "[[50.9765625,36.78289206199065],[50.7952880859375,36.39475669987386],[51.2841796875,36.26199220445664],[51.470947265625,36.66841891894785],[50.9765625,36.78289206199065]]",
                "geeAssetId": null
            }'''))
        withMigrations(new ClassificationMigrations())

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        def contents = JsonOutput.prettyPrint(migrated.contents)
        def expectedContents = JsonOutput.prettyPrint('''
            {
              "id": "recipe-id",
              "title": "classification-title",
              "placeholder": "Migrated_Classification",
              "type": "CLASSIFICATION",
              "model": {
                "source": {
                  "type": "RECIPE_REF",
                  "id": "mosaic-id"
                },
                "trainingData": {
                  "fusionTable": "fusion-table-id",
                  "fusionTableColumn": "class"
                }
              }
            }''')
        contents == expectedContents
    }
    def 'Test with gee assets'() {
        def recipe = saveRecipe(newRecipe(contents: '''
            {
                "id": "recipe-id",
                "type": "CLASSIFICATION",
                "name": "classification-title",
                "inputRecipe": null,
                "fusionTableId": "fusion-table-id",
                "fusionTableClassColumn": "class",
                "algorithm": "cart",
                "geeAssetId": "users/some-user/some-asset",
                "mosaicPreview": true,
                "mosaic":
                {
                    "mapId": "dfb0c06d2e5bbd8e6a01f930812368e5",
                    "token": "14fb835f81ad013786f90ab0a2774185"
                }
            }'''))
        withMigrations(new ClassificationMigrations())

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        def contents = JsonOutput.prettyPrint(migrated.contents)
        def expectedContents = JsonOutput.prettyPrint('''
            {
              "id": "recipe-id",
              "title": "classification-title",
              "placeholder": "Migrated_Classification",
              "type": "CLASSIFICATION",
              "model": {
                "source": {
                  "type": "ASSET",
                  "id": "users/some-user/some-asset"
                },
                "trainingData": {
                  "fusionTable": "fusion-table-id",
                  "fusionTableColumn": "class"
                }
              }
            }''')
        contents == expectedContents
    }
}
