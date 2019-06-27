import {Consumer} from './pageableContext'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export const PageableInfo = props => {
    const renderDefaultInfo = ({count, start, stop}) =>
        <div>
            {msg('pagination.info', {count, start, stop})}
        </div>
        
    const renderCustomInfo = ({count, start, stop}) =>
        <React.Fragment>
            {props.children({count, start, stop})}
        </React.Fragment>

    const pageinfo = ({count, start, stop}) => ({
        count,
        start: start + 1,
        stop
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
