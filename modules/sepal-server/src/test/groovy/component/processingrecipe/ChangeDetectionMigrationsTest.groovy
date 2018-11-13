package component.processingrecipe

import groovy.json.JsonOutput
import org.openforis.sepal.component.processingrecipe.command.MigrateRecipes
import org.openforis.sepal.component.processingrecipe.migration.ChangeDetectionMigrations
import spock.lang.Unroll

class ChangeDetectionMigrationsTest extends RecipeTest {

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
        withMigrations(new ChangeDetectionMigrations())

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        def contents = JsonOutput.prettyPrint(migrated.contents)
        def expectedContents = JsonOutput.prettyPrint('''
            {
              "id": "recipe-id",
              "title": "change-detection-title",
              "placeholder": "Migrated_Change_detection",
              "type": "CHANGE_DETECTION",
              "model": {
                "source1": {
                  "type": "RECIPE_REF",
                  "id": "mosaic-id-1"
                },
                "source2": {
                  "type": "RECIPE_REF",
                  "id": "mosaic-id-2"
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
                "type": "CHANGE_DETECTION",
                "name": "change-detection-title",
                "inputRecipe1": null,
                "inputRecipe2": null,
                "fusionTableId": "fusion-table-id",
                "fusionTableClassColumn": "class",
                "algorithm": "cart",
                "aoiCode": "NGA_CRS",
                "aoiName": "Nigeria_Cross_River_State",
                "polygon": null,
                "geeAssetId1": "users/some-user/asset1",
                "geeAssetId2": "users/some-user/asset2",
                "mosaicPreview": true,
                "mosaic":
                {
                    "mapId": "b60ff1ac34986b21744020606ae80371",
                    "token": "958a2b1aadd2fa456201b17cc6fede51"
                }
            }}'''))
        withMigrations(new ChangeDetectionMigrations())

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        def contents = JsonOutput.prettyPrint(migrated.contents)
        def expectedContents = JsonOutput.prettyPrint('''
            {
              "id": "recipe-id",
              "title": "change-detection-title",
              "placeholder": "Migrated_Change_detection",
              "type": "CHANGE_DETECTION",
              "model": {
                "source1": {
                  "type": "ASSET",
                  "id": "users/some-user/asset1"
                },
                "source2": {
                  "type": "ASSET",
                  "id": "users/some-user/asset2"
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
