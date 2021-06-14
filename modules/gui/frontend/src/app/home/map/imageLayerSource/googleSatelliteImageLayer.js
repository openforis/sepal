import {MapAreaLayout} from '../mapAreaLayout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {setActive, setComplete} from '../progress'
import {withRecipe} from 'app/home/body/process/recipeContext'
import GoogleSatelliteLayer from '../googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'
import withSubscriptions from 'subscription'

export class _GoogleSatelliteImageLayer extends React.Component {
    progress$ = new Subject()

    render() {
        const {map} = this.props
        const layer = new GoogleSatelliteLayer({map, progress$: this.progress$})
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
                ? this.setComplete('tiles')
                : this.setActive('tiles')
        ))
    }

    componentWillUnmount() {
        this.setComplete('tiles')
    }

    setActive(name) {
        const {recipeActionBuilder, componentId} = this.props
        setActive(`${name}-${componentId}`, recipeActionBuilder)
    }

    setComplete(name) {
        const {recipeActionBuilder, componentId} = this.props
        setComplete(`${name}-${componentId}`, recipeActionBuilder)
    }
}

export const GoogleSatelliteImageLayer = compose(
    _GoogleSatelliteImageLayer,
    withSubscriptions(),
    withRecipe()
)

GoogleSatelliteImageLayer.propTypes = {
    map: PropTypes.object
}
