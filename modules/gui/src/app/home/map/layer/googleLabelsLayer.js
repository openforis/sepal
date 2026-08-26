import _ from 'lodash'
import {of, tap} from 'rxjs'

import {MAX_ZOOM} from '../maps'
import {labelsMapTypeStyles, resolveLabelsStyle} from './labelsLayerStyle'
import {OverlayMapTypeLayer} from './overlayMapTypeLayer'

export class GoogleLabelsLayer extends OverlayMapTypeLayer {
    constructor({
        map,
        layerIndex = 0,
        settings = resolveLabelsStyle().categories
    }) {
        super()
        this.map = map
        this.layerIndex = layerIndex
        this.settings = settings
    }

    // The StyledMapType itself is what gets registered. It renders through an internal path rather than
    // its public getTile, so it can be neither wrapped nor given a whole-layer opacity - StyledMapType has
    // no opacity API, unlike ImageMapType. Labels is therefore settings-only.
    createOverlay = () => {
        const {map, settings} = this
        const {google} = map.getGoogle()
        const styledMapType = new google.maps.StyledMapType(
            labelsMapTypeStyles({categories: settings}),
            {name: 'labels'}
        )
        styledMapType.maxZoom = MAX_ZOOM
        return styledMapType
    }

    addToMap = () => {
        this.mountOverlay(this.createOverlay())
    }

    addToMap$ = () =>
        of(true).pipe(
            tap(() => this.addToMap())
        )

    // Category settings are baked into the StyledMapType, so changing them has to replace it.
    equals = other =>
        other === this
            || other instanceof GoogleLabelsLayer
                && _.isEqual(other.settings, this.settings)
}
