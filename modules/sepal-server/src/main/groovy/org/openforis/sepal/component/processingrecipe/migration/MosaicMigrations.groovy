package org.openforis.sepal.component.processingrecipe.migration

import groovy.json.JsonSlurper
import org.openforis.sepal.component.processingrecipe.migration.v3.V3Migration
import org.openforis.sepal.component.processingrecipe.migration.v4.V4Migration
import org.openforis.sepal.component.processingrecipe.migration.v5.V5Migration
import org.openforis.sepal.component.processingrecipe.migration.v6.V6Migration
import org.openforis.sepal.component.processingrecipe.migration.v7.V7Migration

import java.time.LocalDate
import java.time.format.DateTimeFormatter

import static java.time.format.DateTimeFormatter.ISO_DATE

class MosaicMigrations extends AbstractMigrations {
    public static final String OLD_COUNTRY_FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    public static final String NEW_COUNTRY_FUSION_TABLE = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'

    MosaicMigrations() {
        super('MOSAIC')
        addMigration(1, { r ->
            def result = [
                id: r.id,
                title: r.name?.trim(),
                placeholder: 'Migrated_Mosaic',
                type: 'MOSAIC',
                model: [
                    bands: ['RED', 'GREEN', 'BLUE'],
                    dates: dates(r.targetDate, r.offsetToTargetDay),
                    sources: sources(r.sensorGroup, r.sensors),
                    compositeOptions: [
                        corrections: [
                            r.brdfCorrect ? 'BRDF' : null,
                            r.surfaceReflectance ? 'SR' : null,
                        ].findAll(),
                        filters: [
                            inverseFilter(r.mosaicShadowTolerance, 'SHADOW'),
                            inverseFilter(r.mosaicHazeTolerance, 'HAZE'),
                            filter(r.mosaicGreennessWeight, 'NDVI'),
                            filter(r.mosaicTargetDayWeight, 'DAY_OF_YEAR')
                        ].findAll(),
                        mask: [
                            r.maskSnow ? 'SNOW' : null,
                            r.maskClouds ? 'CLOUDS' : null,
                        ].findAll(),
                        compose: r.median ? 'MEDIAN' : 'MEDOID'
                    ],
                    panSharpen: r.panSharpening ?: false
                ]
            ]
            def aoi = aoi(r)
            if (aoi)
                result.model.aoi = aoi
            if (r.sceneAreas) {
                result.model.sceneSelectionOptions = [
                    type: 'SELECT',
                    targetDateWeight: r.sortWeight as double
                ]
                result.model.scenes = scenes(r.sceneAreas, r.sensorGroup)
            } else {
                result.model.sceneSelectionOptions = [type: 'ALL']
            }
            return result
        })
        addMigration(3, { return V3Migration.migrate(it) })
        addMigration(4, { return V4Migration.migrate(it) })
        addMigration(5, { return V5Migration.migrate(it) })
        addMigration(6, { return V6Migration.migrate(it) })
        addMigration(7, { return V7Migration.migrate(it) })
    }

    private static sources(sensorGroup, sensors) {
        if (sensorGroup == 'SENTINEL2')
            ['SENTINEL_2': ['SENTINEL_2']]
        else
            [(sensorGroup): sensors]
    }

    private static filter(value, name) {
        value != null && (value as String).isNumber() && (value as double) > 0 ? [type: name, percentile: Math.round(100 * (value as double))] : null
    }

    private static inverseFilter(value, name) {
        value != null && (value as String).isNumber() && (value as double) < 1 ? [type: name, percentile: Math.round(100 * (1 - (value as double)))] : null
    }

    private static aoi(r) {
        def polygon = r.polygon
        if (polygon)
            return [
                type: 'POLYGON',
                path: new JsonSlurper().parseText(polygon)
            ]
        else if (r.aoiCode || r.aoiFusionTable == OLD_COUNTRY_FUSION_TABLE)
            return [
                type: 'FUSION_TABLE',
                id: NEW_COUNTRY_FUSION_TABLE,
                keyColumn: 'id',
                key: r.aoiCode ?: r.aoiFusionTableKey,
                level: (r.aoiCode ?: r.aoiFusionTableKey).length() == 3 ? 'COUNTRY' : 'AREA'
            ]
        else if (r.aoiFusionTable)
            return [
                type: 'FUSION_TABLE',
                id: r.aoiFusionTable,
                keyColumn: r.aoiFusionTableKeyColumn,
                key: r.aoiFusionTableKey,
            ]
    }

    private static scenes(sceneAreas, sensorGroup) {
        sceneAreas.collectEntries { sceneArea ->
            [(sceneArea.key): sceneArea.value.selection.collect { sceneId ->
                [
                    id: sceneId,
                    date: sceneDate(sceneId, sensorGroup),
                    dataSet: sceneDataSet(sceneId, sensorGroup)
                ]
            }]
        }
    }

    private static sceneDate(String id, sensorGroup) {
        if (sensorGroup == 'LANDSAT')
            return LocalDate.parse(id.substring(9, 16), DateTimeFormatter.ofPattern("yyyyDDD")).format(ISO_DATE)
        else
            return LocalDate.parse(id.substring(0, 8), DateTimeFormatter.ofPattern("yyyyMMdd")).format(ISO_DATE)
    }

    private static sceneDataSet(String id, sensorGroup) {
        if (sensorGroup == 'LANDSAT') {
            def prefix = id.substring(0, 3)
            switch (prefix) {
                case 'LC9': return 'LANDSAT_9'
                case 'LC8': return 'LANDSAT_8'
                case 'LE7': return 'LANDSAT_7'
                case 'LT5': return 'LANDSAT_TM'
                case 'LT4': return 'LANDSAT_TM'
                default: throw new IllegalStateException('Unexpected scene id prefix: ' + prefix)
            }
        } else
            return 'SENTINEL_2'
    }

    static dates(targetDate, offsetToTargetDay) {
        [
            targetDate: targetDate,
            seasonStart: seasonStart(targetDate, offsetToTargetDay),
            seasonEnd: seasonEnd(targetDate, offsetToTargetDay),
            yearsBefore: yearsBefore(offsetToTargetDay),
            yearsAfter: yearsAfter(offsetToTargetDay)
        ]
    }


    private static String seasonStart(String targetDate, offsetToTargetDay) {
        def date = LocalDate.parse(targetDate)
        if (!offsetToTargetDay) // 0 Offset
            return date.withDayOfYear(1).format(ISO_DATE)
        else if (offsetToTargetDay % 2) // Odd offset
            return date.minusMonths(6).format(ISO_DATE)
        else // Even offset
            return targetDate
    }

    private static String seasonEnd(String targetDate, offsetToTargetDay) {
        def date = LocalDate.parse(targetDate)
        if (!offsetToTargetDay)
            return date.plusYears(1).withDayOfYear(1).format(ISO_DATE)
        else if (offsetToTargetDay % 2) // Odd offset
            return date.plusMonths(6).format(ISO_DATE)
        else // Even offset
            return date.plusYears(1).format(ISO_DATE)
    }

    private static int yearsBefore(offsetToTargetDay = 0) {
        offsetToTargetDay / 2
    }

    private static int yearsAfter(offsetToTargetDay = 0) {
        (offsetToTargetDay - 1) / 2
    }
}
