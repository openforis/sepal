import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'

import {withMap} from '../../../map/mapContext'
import {withRecipe} from '../recipeContext'

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
        const {stream, recipe, value, map, recipeActionBuilder} = this.props
        if (value) {
            const {linked: wasLinked} = map.linked$.getValue()
            stream('LOAD_BOUNDS',
                api.gee.recipeBounds$(recipe),
                bounds => {
                    recipeActionBuilder('SET_BOUNDS', {bounds})
                        .set('ui.bounds', bounds)
                        .dispatch(0)
                    const {linked: isLinked, synchronize: {synchronizeOut} = {}} = map.linked$.getValue()
                    if (!isLinked || wasLinked || synchronizeOut) {
                        map.fitBounds(bounds)
                    }
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
