import {readdir} from 'node:fs/promises'
import {join} from 'node:path'

import {lastValueFrom} from 'rxjs'

import {createVrt$, setBandNames$} from '#sepal/gdal'

export const buildVrt = async ({dir, name, bands}) => {
    const vrtPath = join(dir, `${name}.vrt`)
    const inputPaths = (await geoTiffs(dir)).map(file => join(dir, file))
    await lastValueFrom(createVrt$({inputPaths, outputPath: vrtPath}), {defaultValue: null})
    await lastValueFrom(setBandNames$(vrtPath, bands.selection), {defaultValue: null})
}

export const geoTiffs = async dir =>
    (await readdir(dir))
        .filter(file => file.endsWith('.tif'))
        .sort()
