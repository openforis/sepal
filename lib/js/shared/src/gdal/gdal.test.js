import Path from 'path'

import {getBandNames$} from '#sepal/gdal'
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
        emitsOne(value => expect(value).toEqual(['blue', 'green', 'red']))
    )

    // stream('returns list of names for VRT',
    //     () => getBandNames$(resource('three_bands.vrt')),
    //     // () => getBandNames$(resource('three_bands.vrt')),
    //     emitsOne(value => expect(value).toEqual(['blue', 'green', 'red']))
    // )
})
