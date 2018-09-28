package component.processingrecipe

import groovy.json.JsonOutput
import org.openforis.sepal.component.processingrecipe.command.MigrateRecipes
import org.openforis.sepal.component.processingrecipe.migration.MosaicMigrations
import spock.lang.Unroll

class MosaicMigrationsTest extends RecipeTest {

    def 'Test with polygon'() {
        def recipe = saveRecipe(newRecipe(contents: '{"id":"bc5f94e6-fb1e-b6f2-d45c-18432015d95b","type":"MOSAIC","name":"polygon_mosaic","aoiCode":null,"aoiName":null,"sensorGroup":"LANDSAT","targetDate":"2018-09-05","sortWeight":0.5,"sensors":["LANDSAT_8","LANDSAT_7","LANDSAT_TM"],"offsetToTargetDay":0,"minScenes":1,"maxScenes":null,"maskSnow":true,"brdfCorrect":true,"median":false,"mosaicTargetDayWeight":0,"mosaicShadowTolerance":1,"mosaicHazeTolerance":0.05,"mosaicGreennessWeight":0,"panSharpening":false,"polygon":"[[12.462927350619111,41.87303911003311],[12.462927350619111,41.843888713632325],[12.510992536165986,41.846190543809854],[12.51064921341208,41.87303911003311],[12.462927350619111,41.87303911003311]]","sceneAreas":{"191_31":{"polygon":[[42.718,11.187],[41.121,10.689000000000004],[40.793,12.945],[42.382,13.496999999999996],[42.718,11.187]],"selection":["LE71910312018214NSG00"],"sceneAreaId":"191_31"},"190_31":{"polygon":[[42.718,12.731999999999996],[41.121,12.233999999999996],[40.793,14.489999999999998],[42.38199999999999,15.042000000000002],[42.718,12.731999999999996]],"selection":[],"sceneAreaId":"190_31"}},"mosaicPreviewBand":null,"scenesPreview":true}'))
        withMigrations(new MosaicMigrations())

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        def contents = JsonOutput.prettyPrint(migrated.contents)
        def expectedContents = JsonOutput.prettyPrint('''
            {
              "id": "bc5f94e6-fb1e-b6f2-d45c-18432015d95b",
              "title": "polygon_mosaic",
              "placeholder": "Migrated_Mosaic",
              "type": "MOSAIC",
              "model": {
                "bands": [
                  "RED",
                  "GREEN",
                  "BLUE"
                ],
                "dates": {
                  "targetDate": "2018-09-05",
                  "seasonStart": "2018-01-01",
                  "seasonEnd": "2019-01-01",
                  "yearsBefore": 0,
                  "yearsAfter": 0
                },
                "sources": {
                  "LANDSAT": [
                    "LANDSAT_8",
                    "LANDSAT_7",
                    "LANDSAT_TM"
                  ]
                },
                "sceneSelectionOptions": {
                  "type": "SELECT",
                  "targetDateWeight": 0.5
                },
                "compositeOptions": {
                  "corrections": [
                    "BRDF"
                  ],
                  "filters": [
                    {"type": "HAZE", "percentile": 0.95}
                  ],
                  "mask": [
                    "SNOW"
                  ],
                  "compose": "MEDOID"
                },
                "aoi": {
                  "type": "POLYGON",
                  "path": [[12.462927350619111,41.87303911003311],[12.462927350619111,41.843888713632325],[12.510992536165986,41.846190543809854],[12.51064921341208,41.87303911003311],[12.462927350619111,41.87303911003311]]
                },
                "scenes": {
                  "191_31": [
                    {
                      "id": "LE71910312018214NSG00",
                      "date": "2018-08-02",
                      "dataSet": "LANDSAT_7"
                    }
                  ],
                  "190_31": []
                },
                "panSharpen": false
              }
            }''')
        contents == expectedContents
    }

    def 'Test with fusion table'() {
        def recipe = saveRecipe(newRecipe(contents: '{"id":"764b154d-8df5-5a24-93a7-49127747da4d","type":"MOSAIC","name":"fusion_table_mosaic","aoiCode":null,"aoiName":null,"sensorGroup":"SENTINEL2","targetDate":"2018-09-05","sortWeight":0.5,"sensors":["SENTINEL2A"],"offsetToTargetDay":2,"minScenes":1,"maxScenes":null,"maskSnow":true,"brdfCorrect":true,"median":false,"mosaicTargetDayWeight":0,"mosaicShadowTolerance":1,"mosaicHazeTolerance":0.05,"mosaicGreennessWeight":0,"aoiFusionTable":"15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F","aoiFusionTableKeyColumn":"ISO","aoiFusionTableKey":"SMR","aoiFusionTableLabelColumn":"NAME_FAO","aoiFusionTableLabel":"San Marino","panSharpening":false,"polygon":null,"sceneAreas":{"32TQP":{"polygon":[[44.225975000000005,11.503571000000003],[43.238272999999985,11.462735],[43.201211,12.812632],[44.187621999999976,12.875738999999996],[44.225975000000005,11.503571000000003]],"selection":["20170921T101021_20170921T101436_T32TQP"],"sceneAreaId":"32TQP"},"33TUJ":{"polygon":[[43.238262999999996,12.536772],[43.259392,13.888682999999999],[44.24783100000001,13.870237000000007],[44.225964,12.495929],[43.238262999999996,12.536772]],"selection":[],"sceneAreaId":"33TUJ"}},"mosaicPreviewBand":"red, green, blue","scenesPreview":true}'))
        withMigrations(new MosaicMigrations())

        when:
        migrate()

        then:
        def migrated = getRecipeById(recipe.id)
        def contents = JsonOutput.prettyPrint(migrated.contents)
        def expectedContents = JsonOutput.prettyPrint('''
            {
              "id": "764b154d-8df5-5a24-93a7-49127747da4d",
              "title": "fusion_table_mosaic",
              "placeholder": "Migrated_Mosaic",
              "type": "MOSAIC",
              "model": {
                "bands": [
                  "RED",
                  "GREEN",
                  "BLUE"
                ],
                "dates": {
                  "targetDate": "2018-09-05",
                  "seasonStart": "2018-09-05",
                  "seasonEnd": "2019-09-05",
                  "yearsBefore": 1,
                  "yearsAfter": 0
                },
                "sources": {
                  "SENTINEL_2": [
                    "SENTINEL_2"
                  ]
                },
                "sceneSelectionOptions": {
                  "type": "SELECT",
                  "targetDateWeight": 0.5
                },
                "compositeOptions": {
                  "corrections": [
                    "BRDF"
                  ],
                  "filters": [
                    {"type": "HAZE", "percentile": 0.95}
                  ],
                  "mask": [
                    "SNOW"
                  ],
                  "compose": "MEDOID"
                },
                "aoi": {
                  "type": "FUSION_TABLE",
                  "id": "1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU",
                  "keyColumn": "id",
                  "key": "SMR",
                  "level": "COUNTRY"
                },
                "scenes": {
                  "32TQP": [
                    {
                      "id": "20170921T101021_20170921T101436_T32TQP",
                      "date": "2017-09-21",
                      "dataSet": "SENTINEL_2"
                    }
                  ],
                  "33TUJ": []
                },
                "panSharpen": false
              }
            }''')
        contents == expectedContents
    }

    @Unroll
    def 'Dates with target #target and offset #offset'() {
        withMigrations(new MosaicMigrations())

        when:
        def dates = MosaicMigrations.dates(target, offset)

        then:
        dates.targetDate == target
        dates.seasonStart == seasonStart
        dates.seasonEnd == seasonEnd
        dates.yearsBefore == yearsBefore
        dates.yearsAfter == yearsAfter

        where:
        target       | offset || seasonStart  | seasonEnd    | yearsBefore | yearsAfter
        '2005-02-01' | 0      || '2005-01-01' | '2006-01-01' | 0           | 0
        '2005-02-01' | 1      || '2004-08-01' | '2005-08-01' | 0           | 0
        '2005-02-01' | 2      || '2005-02-01' | '2006-02-01' | 1           | 0
        '2005-02-01' | 3      || '2004-08-01' | '2005-08-01' | 1           | 1
        '2005-02-01' | 4      || '2005-02-01' | '2006-02-01' | 2           | 1
    }
}
