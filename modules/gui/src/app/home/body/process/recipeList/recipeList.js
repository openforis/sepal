import {Pageable} from 'widget/pageable/pageable'
import {RecipeListData} from './recipeListData'
import {RecipeListPagination} from './recipeListPagination'
import {compose} from 'compose'
import {connect, select} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export const PROJECT_RECIPE_SEPARATOR = ' / '
export const NO_PROJECT_SYMBOL = '<no project>'
export const NO_PROJECT_OPTION = {
    value: NO_PROJECT_SYMBOL,
    label: '<no project>'
}

const mapStateToProps = () => ({
    filteredRecipes: select('process.filteredRecipes') ?? []
})

class _RecipeList extends React.Component {
    render() {
        const {filteredRecipes, children} = this.props
        return filteredRecipes ? (
            <Pageable items={filteredRecipes}>
                {children}
            </Pageable>
        ) : null
    }
}

export const RecipeList = compose(
    _RecipeList,
    connect(mapStateToProps)
)

RecipeList.propTypes = {
    children: PropTypes.any.isRequired,
}

RecipeList.Data = RecipeListData

RecipeList.Pagination = RecipeListPagination
