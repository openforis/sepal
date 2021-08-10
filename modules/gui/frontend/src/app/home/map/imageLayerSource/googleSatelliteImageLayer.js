import {MapAreaLayout} from '../mapAreaLayout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {withTabContext} from 'widget/tabs/tabContext'
import GoogleSatelliteLayer from '../layer/googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'
import withSubscriptions from 'subscription'

export class _GoogleSatelliteImageLayer extends React.Component {
    progress$ = new Subject()

    render() {
        const {map} = this.props
        const layer = new GoogleSatelliteLayer({map, progress$: this.progress$})
        this.layer = layer
        return (
            <MapAreaLayout
                layer={layer}
                map={map}
            />
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(this.progress$.subscribe(
            ({complete}) => complete
                ? this.setBusy('tiles', false)
                : this.setBusy('tiles', true)
        ))
    }

    componentWillUnmount() {
        this.setBusy('tiles', false)
    }

    setBusy(name, busy) {
        const {tabContext: {setBusy}, componentId} = this.props
        setBusy(`${name}-${componentId}`, busy)
    }
}

export const GoogleSatelliteImageLayer = compose(
    _GoogleSatelliteImageLayer,
    withSubscriptions(),
    withRecipe(),
    withTabContext()
)

GoogleSatelliteImageLayer.propTypes = {
    map: PropTypes.object
}
