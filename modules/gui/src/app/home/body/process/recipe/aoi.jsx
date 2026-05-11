import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'

import {withMap} from '../../../map/mapContext'
import {withRecipe} from '../recipeContext'
import {collectDependentHashes, dependentHashesChanged} from './dependentHashes'

const mapStateToProps = (state, {recipe}) => ({
    dependentHashes: recipe ? collectDependentHashes(state, recipe) : {}
})

class _Aoi extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.loadBounds()
    }

    componentDidUpdate(prevProps) {
        const {value: prevValue, dependentHashes: prevDependentHashes} = prevProps
        const {value, dependentHashes} = this.props
        if (!_.isEqual(value, prevValue)) {
            this.loadBounds()
        } else if (dependentHashesChanged(prevDependentHashes, dependentHashes)) {
            // Dep AOI changed in another tab. Refresh `ui.bounds` so the
            // "fit-to-bounds" button centers on the current bounds, but don't
            // auto-fit the viewport — that would yank the user's view while
            // they're editing the dep elsewhere.
            this.loadBounds({fit: false})
        }
    }

    loadBounds({fit = true} = {}) {
        const {stream, recipe, value, map, recipeActionBuilder} = this.props
        if (value) {
            const {linked: wasLinked} = map.linked$.getValue()
            stream('LOAD_BOUNDS',
                api.gee.recipeBounds$(recipe),
                bounds => {
                    recipeActionBuilder('SET_BOUNDS', {bounds})
                        .set('ui.bounds', bounds)
                        .dispatch(0)
                    if (fit) {
                        const {linked: isLinked, synchronize: {synchronizeOut} = {}} = map.linked$.getValue()
                        if (!isLinked || wasLinked || synchronizeOut) {
                            map.fitBounds(bounds)
                        }
                    }
                }
            )
        }
    }
}

export const Aoi = compose(
    _Aoi,
    connect(mapStateToProps),
    withRecipe(recipe => ({recipe})),
    withMap()
)

Aoi.propTypes = {
    value: PropTypes.any
}
