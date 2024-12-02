import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'

import {Consumer} from './pageableContext'

export const PageableInfo = props => {
    const renderDefaultInfo = ({count, start, stop}) =>
        <div>
            {msg('pagination.info', {count, start, stop})}
        </div>
        
    const renderCustomInfo = ({count, start, stop, isSinglePage}) =>
        <React.Fragment>
            {props.children({count, start, stop, isSinglePage})}
        </React.Fragment>

    const pageinfo = ({count, start, stop, isFirstPage, isLastPage, isSinglePage}) => ({
        count,
        start: start + 1,
        stop,
        isFirstPage,
        isLastPage,
        isSinglePage
    })

    return (
        <Consumer>
            {pageable => props.children
                ? renderCustomInfo(pageinfo(pageable))
                : renderDefaultInfo(pageinfo(pageable))
            }
        </Consumer>
    )
}

PageableInfo.propTypes = {
    children: PropTypes.func
}
