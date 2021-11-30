import {Pageable} from 'widget/pageable/pageable'
import React from 'react'

export class RecipeListPagination extends React.Component {
    render() {
        return (
            <Pageable.Controls/>
        )
    }
}

RecipeListPagination.propTypes = {}
