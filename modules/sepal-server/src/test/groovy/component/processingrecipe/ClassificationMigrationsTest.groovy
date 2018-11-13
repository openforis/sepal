package component.processingrecipe

import groovy.json.JsonOutput
import org.openforis.sepal.component.processingrecipe.command.MigrateRecipes
import org.openforis.sepal.component.processingrecipe.migration.ClassificationMigrations
import spock.lang.Unroll

class ClassificationMigrationsTest extends RecipeTest {

    def 'Test with mosaic references'() {
        def recipe = saveRecipe(newRecipe(contents: '''
            {
                "id": "recipe-id",
                "type": "CHANGE_DETECTION",
                "name": "change-detection-title",
                "inputRecipe1": "mosaic-id-1",
                "inputRecipe2": "mosaic-id-2",
                "fusionTableId": "fusion-table-id",
                "fusionTableClassColumn": "class",
                "algorithm": "cart",
                "aoiCode": "NGA_CRS",
                "aoiName": "Nigeria_Cross_River_State",
                "polygon": null,
                "geeAssetId1": null,
                "geeAssetId2": null,
                "mosaicPreview": true,
                "mosaic":
                {
                    "mapId": "b60ff1ac34986b21744020606ae80371",
                    "token": "958a2b1aadd2fa456201b17cc6fede51"
                }
            }}'''))
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
