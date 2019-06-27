import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Consumer} from './pageableContext'
import PropTypes from 'prop-types'
import React from 'react'

export const PageableControls = props => {
    const renderDefaultControls = pageable =>
        <ButtonGroup type='horizontal-nowrap'>
            <Button
                chromeless
                size='large'
                shape='pill'
                icon='fast-backward'
                onClick={() => pageable.firstPage()}
                disabled={pageable.isFirstPage}/>
            <Button
                chromeless
                size='large'
                shape='pill'
                icon='backward'
                onClick={() => pageable.previousPage()}
                disabled={pageable.isFirstPage}/>
            <Button
                chromeless
                size='large'
                shape='pill'
                icon='forward'
                onClick={() => pageable.nextPage()}
                disabled={pageable.isLastPage}/>
        </ButtonGroup>
    const renderCustomControls = pageable =>
        <React.Fragment>
            {props.children({...pageable, renderDefaultControls: () => renderDefaultControls(pageable)})}
        </React.Fragment>

    return (
        <Consumer>
            {pageable => props.children
                ? renderCustomControls(pageable)
                : renderDefaultControls(pageable)
            }
        </Consumer>
    )
}

PageableControls.propTypes = {
    children: PropTypes.func
}
