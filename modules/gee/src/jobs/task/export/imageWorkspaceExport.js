import moment from 'moment'
import {forkJoin, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'

import {startImageToWorkspaceExport$} from './toWorkspace.js'

export const startImageWorkspaceExport$ = ({image: {recipe, workspacePath: _workspacePath, bands, filenamePrefix, scale, ...retrieveOptions}}, {sepalUser}) => {
    const description = recipe.title || recipe.placeholder
    const factory = ImageFactory(recipe, withOutputBands(bands))
    return forkJoin({image: factory.getImage$(), geometry: factory.getGeometry$()}).pipe(
        switchMap(({image, geometry}) => startImageToWorkspaceExport$({
            ...retrieveOptions,
            image,
            folder: `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`,
            description: filenamePrefix || description,
            region: geometry.bounds(scale),
            scale
        }, {sepalUser}))
    )
}
