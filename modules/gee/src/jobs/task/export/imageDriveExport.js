import {forkJoin, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'

import {startImageToDriveExport$} from './toDrive.js'

export const startImageDriveExport$ = ({image: {recipe, bands, driveFolder: folder, scale, ...retrieveOptions}}, {sepalUser}) => {
    const description = recipe.title || recipe.placeholder
    const factory = ImageFactory(recipe, withOutputBands(bands))
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) =>
            startImageToDriveExport$({
                ...retrieveOptions,
                image,
                folder,
                description,
                region: geometry.bounds(scale),
                scale
            }, {sepalUser})
        )
    )
}
