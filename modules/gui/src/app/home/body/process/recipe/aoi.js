import {compose} from 'compose'
import {withMap} from '../../../map/mapContext'
import {withRecipe} from '../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

class _Aoi extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.loadBounds()
    }

    componentDidUpdate(prevProps) {
        const {value: prevValue} = prevProps
        const {value} = this.props
        if (!_.isEqual(value, prevValue)) {
            this.loadBounds()
        }
    }

    loadBounds() {
        const {aoi, stream, recipe, value, map, recipeActionBuilder} = this.props
        if (value) {
            stream('LOAD_BOUNDS',
                api.gee.recipeBounds$(recipe),
                bounds => {
                    recipeActionBuilder('SET_BOUNDS', {bounds})
                        .set('ui.bounds', bounds)
                        .dispatch(0)
                    map.fitBounds(bounds)
                }
            )
        }
    }
}

export const Aoi = compose(
    _Aoi,
    withRecipe(recipe => ({recipe})),
    withMap()
)

Aoi.propTypes = {
    value: PropTypes.any
}
