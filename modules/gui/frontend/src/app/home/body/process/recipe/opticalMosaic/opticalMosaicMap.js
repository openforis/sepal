import {MapAreaLayout} from '../../../../map/mapAreaLayout'
import EarthEngineLayer from '../../../../map/earthEngineLayer'
import React from 'react'

export class OpticalMosaicMap extends React.Component {
    render() {
        const {recipe, layerConfig, map} = this.props
        const layer = map
            ? EarthEngineLayer.fromRecipe({recipe, layerConfig, map})
            : null
        if (layer) {
            map.setLayer({
                id: 'imageLayer',
                layer
            })
        }

        return (
            <MapAreaLayout
                layer={layer}
                form={null}
            />
        )
    }
}
