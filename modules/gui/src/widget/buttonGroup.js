import {Widget} from './widget'
import {compose} from 'compose'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withForwardedRef from 'ref'

const Context = React.createContext()

export const withButtonGroup = withContext(Context, 'buttonGroup')

const _ButtonGroup = ({className, contentClassName, layout, alignment, spacing, framed, label, dimmed, disabled,
    tooltip, tooltipPlacement, tooltipTrigger, onMouseOver, onMouseOut, forwardedRef, children, buttonGroup: {dimmed: parentDimmed} = {}}) => {
    const mapChild = (child, index, childrenCount) => {
        const joinLeft = spacing === 'none' && childrenCount > 1 && index !== 0
        const joinRight = spacing === 'none' && childrenCount > 1 && index !== childrenCount - 1
        return (
            <Context.Provider value={{joinLeft, joinRight, dimmed: dimmed || parentDimmed}}>
                {child}
            </Context.Provider>
        )
    }

    const mapChildren = children =>
        React.Children.map(children, (child, index) =>
            mapChild(child, index, children.length)
        )

    return children
        ? (
            <Widget
                ref={forwardedRef}
                className={className}
                contentClassName={contentClassName}
                label={label}
                layout={layout}
                alignment={alignment}
                spacing={spacing}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                tooltipTrigger={tooltipTrigger}
                framed={framed}
                disabled={disabled}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}>
                {mapChildren(React.Children.toArray(children))}
            </Widget>
        
        )
        : null
}

export const ButtonGroup = compose(
    _ButtonGroup,
    withButtonGroup(),
    withForwardedRef()
)

ButtonGroup.propTypes = {
    alignment: PropTypes.any,
    children: PropTypes.any,
    className: PropTypes.string,
    contentClassName: PropTypes.string,
    dimmed: PropTypes.any,
    disabled: PropTypes.any,
    framed: PropTypes.any,
    label: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    tooltipTrigger: PropTypes.any,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

ButtonGroup.defaultProps = {
    alignment: 'left',
    layout: 'horizontal',
    spacing: 'compact'
}
