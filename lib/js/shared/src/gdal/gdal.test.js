import assert from 'node:assert/strict'
import {copyFile, mkdir, mkdtemp, readdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import Path from 'node:path'
import {afterEach, beforeEach, describe, test} from 'node:test'

import {lastValueFrom} from 'rxjs'

import {createVrt$, getBandNames$, setBandNames$} from '#sepal/gdal'
import {dirName} from '#sepal/path'
import {emitsNothing, emitsOne, stream, throwsError} from '#sepal/test/rxjs'

const __dirname = dirName(import.meta.url)

const resource = relativePath => Path.join(__dirname, '../../testResources/', relativePath)

describe('getBandNames$()', () => {
    stream('fails when file does not exist',
        () => getBandNames$(resource('non_existing.tif')),
        emitsNothing(),
        throwsError()
    )

    stream('returns list of names for GeoTIFF',
        () => getBandNames$(resource('three_bands.tif')),
        emitsOne(value => assert.deepEqual(value, ['blue', 'green', 'red']))
    )
})

describe('paths and band names reach GDAL as single arguments', () => {
    let root

    beforeEach(async () => {
        root = await mkdtemp(Path.join(tmpdir(), 'gdal-'))
    })

    afterEach(async () => {
        await rm(root, {recursive: true, force: true})
    })

    test('a VRT is built and renamed in a directory whose name has a space, brackets and shell syntax', async () => {
        const dir = Path.join(root, 'my export [1]; touch injected')
        await mkdir(dir)
        const tif = Path.join(dir, 'image 1.tif')
        await copyFile(resource('three_bands.tif'), tif)
        const vrt = Path.join(dir, 'my export.vrt')

        await lastValueFrom(createVrt$({inputPaths: [tif], outputPath: vrt}), {defaultValue: null})
        await lastValueFrom(setBandNames$(vrt, ['near infrared', '$(touch injected)', 'red']), {defaultValue: null})

        assert.deepEqual(
            await lastValueFrom(getBandNames$(vrt)),
            ['near infrared', '$(touch injected)', 'red']
        )
        assert.deepEqual(await readdir(root), ['my export [1]; touch injected'])
    })
})
