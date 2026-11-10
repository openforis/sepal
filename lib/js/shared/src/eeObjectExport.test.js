import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {assertEEObjectExport, eeObjectTaskParams, eeTableFormat} from './eeObjectExport.js'

const expression = {result: '0', values: {'0': {constantValue: 1}}}

describe('assertEEObjectExport', () => {
    for (const destination of ['DRIVE', 'SEPAL']) {
        test(`${destination} tables reject formats that would silently become CSV`, () => {
            for (const fileFormat of ['TF_RECORD', 'TFRecord', 'GEO_TIFF', 'invalid', '', 'toString']) {
                assert.throws(
                    () => assertEEObjectExport({kind: 'TABLE', destination, expression, fileFormat}),
                    /Unsupported table export fileFormat/
                )
            }
        })

        test(`${destination} tables accept every spelling Earth Engine accepts and the CSV default`, () => {
            for (const fileFormat of [undefined, null, 'CSV', 'csv', 'GeoJSON', 'geojson', 'GEO_JSON', 'JSON', 'KML', 'kmz', 'SHP', 'shp']) {
                assert.doesNotThrow(() => assertEEObjectExport({kind: 'TABLE', destination, expression, fileFormat}))
            }
        })

        test(`${destination} images still accept TFRecord`, () => {
            for (const fileFormat of ['TF_RECORD', 'TFRecord']) {
                assert.doesNotThrow(() => assertEEObjectExport({kind: 'IMAGE', destination, expression, fileFormat}))
            }
        })
    }

    for (const workspacePath of ['../outside', '/tmp/outside', 'out/../../outside', '~/../outside', 42]) {
        test(`rejects workspace path ${JSON.stringify(workspacePath)}, which leads outside the home folder`, () => {
            assert.throws(
                () => assertEEObjectExport({kind: 'IMAGE', destination: 'SEPAL', expression, workspacePath}),
                /workspacePath must be relative to the SEPAL home directory/
            )
        })
    }

    for (const workspacePath of ['module_results/demo', '~/module_results/demo', 'a/../b', '~']) {
        test(`accepts workspace path ${workspacePath}, inside the home folder`, () => {
            assert.doesNotThrow(() => assertEEObjectExport({kind: 'IMAGE', destination: 'SEPAL', expression, workspacePath}))
        })
    }
})

describe('eeTableFormat', () => {
    test('names each table format the way the exporters take it', () => {
        assert.deepEqual(
            ['csv', 'GEO_JSON', 'geojson', 'json', 'kml', 'KMZ', 'shp'].map(eeTableFormat),
            ['CSV', 'GeoJSON', 'GeoJSON', 'GeoJSON', 'KML', 'KMZ', 'SHP']
        )
    })
})

describe('eeObjectTaskParams', () => {
    test('records a workspace export in the folder it lands in', () => {
        const params = exportParams({destination: 'SEPAL', workspacePath: 'module_results/demo'})

        const {export: spec, taskInfo} = eeObjectTaskParams(params)

        assert.equal(spec.workspacePath, 'module_results/demo')
        assert.equal(taskInfo.outputPath, 'module_results/demo')
    })

    test('records a workspace export without a path in downloads, under its name', () => {
        const {export: spec, taskInfo} = eeObjectTaskParams(exportParams({destination: 'SEPAL'}, {description: '../my export'}))

        assert.equal(spec.workspacePath, 'downloads/_my_export')
        assert.equal(taskInfo.outputPath, 'downloads/_my_export')
    })

    for (const [workspacePath, expected] of [['~/module_results/demo', 'module_results/demo'], ['~', '.'], ['~/', '.']]) {
        test(`reads workspace path ${workspacePath} as relative to the home folder`, () => {
            const {export: spec, taskInfo} = eeObjectTaskParams(exportParams({destination: 'SEPAL', workspacePath}))

            assert.equal(spec.workspacePath, expected)
            assert.equal(taskInfo.outputPath, expected)
        })
    }

    test('keeps the default workspace folder of a long name within the task name length', () => {
        const {export: {workspacePath}} = eeObjectTaskParams(exportParams({destination: 'SEPAL'}, {description: 'n'.repeat(300)}))

        assert.equal(workspacePath, `downloads/${'n'.repeat(100)}`)
    })

    test('records a Drive export in the folder Earth Engine writes to', () => {
        const {export: spec, taskInfo} = eeObjectTaskParams(exportParams({destination: 'DRIVE', driveFolder: 'exports/tables'}))

        assert.equal(spec.driveFolder, 'exports_tables')
        assert.equal(taskInfo.outputPath, 'exports_tables')
    })

    test('records a Drive export without a folder in the folder named after it', () => {
        const {taskInfo} = eeObjectTaskParams(exportParams({destination: 'DRIVE'}, {description: 'forest/loss'}))

        assert.equal(taskInfo.outputPath, 'forest_loss')
    })

    test('records an asset export at its asset id', () => {
        const params = exportParams({destination: 'GEE', assetId: 'projects/p/assets/out'})

        const {export: spec, taskInfo} = eeObjectTaskParams(params)

        assert.deepEqual(spec, params.export)
        assert.equal(taskInfo.outputPath, 'projects/p/assets/out')
        assert.equal(taskInfo.filenamePrefix, undefined)
    })

    for (const destination of ['DRIVE', 'SEPAL']) {
        test(`records the file name prefix of a ${destination} export as its files carry it`, () => {
            const {export: spec, taskInfo} = eeObjectTaskParams(exportParams({destination, filenamePrefix: '2024/NDVI (v2)'}))

            assert.equal(spec.filenamePrefix, '2024_NDVI (v2)')
            assert.equal(taskInfo.filenamePrefix, '2024_NDVI (v2)')
        })

        test(`records the name of a ${destination} export without a prefix as its file name prefix`, () => {
            const {taskInfo} = eeObjectTaskParams(exportParams({destination}, {description: 'ndvi (v2)'}))

            assert.equal(taskInfo.filenamePrefix, 'ndvi_v2_')
        })
    }

    for (const kind of ['IMAGE', 'TABLE']) {
        test(`records the kind and destination of a ${kind} export whatever task info the client sent`, () => {
            const origin = {type: 'NOTEBOOK', path: 'analysis.ipynb'}
            const params = exportParams({kind, destination: 'GEE', assetId: 'projects/p/assets/out'}, {
                taskInfo: {kind: 'OTHER', destination: 'SEPAL', outputPath: 'elsewhere', source: 'pysepal-api', origin}
            })

            const {taskInfo} = eeObjectTaskParams(params)

            assert.equal(taskInfo.kind, kind)
            assert.equal(taskInfo.destination, 'GEE')
            assert.equal(taskInfo.source, 'pysepal-api')
            assert.deepEqual(taskInfo.origin, origin)
        })
    }

    for (const destination of ['GEE', 'DRIVE', 'SEPAL']) {
        test(`resolves a ${destination} export it already resolved to the same params`, () => {
            const resolved = eeObjectTaskParams(exportParams({
                destination, assetId: 'projects/p/assets/out', workspacePath: '~/x', driveFolder: 'a/b', filenamePrefix: 'c/d'
            }))

            assert.deepEqual(eeObjectTaskParams(resolved), resolved)
        })
    }

    test('leaves params without an export block as they are', () => {
        const params = {description: 'ndvi', taskInfo: {outputPath: 'x'}}

        assert.equal(eeObjectTaskParams(params), params)
    })
})

const exportParams = (exportOverrides, overrides = {}) => ({
    description: 'ndvi',
    export: {kind: 'IMAGE', expression, ...exportOverrides},
    ...overrides
})
