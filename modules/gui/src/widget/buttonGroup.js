import {Widget} from './widget'
import {compose} from 'compose'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withForwardedRef from 'ref'

const Context = React.createContext()

export const withButtonGroup = withContext(Context, 'buttonGroup')

const _ButtonGroup = ({className, contentClassName, layout, alignment, spacing, framed, label, disabled, onMouseOver, onMouseOut, forwardedRef, children}) => {
    const mapChild = (child, index, childrenCount) => {
        const joinLeft = childrenCount > 1 && index !== 0
        const joinRight = childrenCount > 1 && index !== childrenCount - 1
        return (
            <Context.Provider value={{joinLeft, joinRight}}>
                {child}
            </Context.Provider>
        )
    }

    const mapChildren = children =>
        React.Children.map(children, (child, index) =>
            mapChild(child, index, children.length)
        )

    return (
        <Widget
            ref={forwardedRef}
            className={className}
            contentClassName={contentClassName}
            label={label}
            layout={layout}
            alignment={alignment}
            spacing={spacing}
            framed={framed}
            disabled={disabled}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}>
            {spacing === 'none' ? mapChildren(_.compact(children)) : children}
        </Widget>
    )
}

export const ButtonGroup = compose(
    _ButtonGroup,
    withForwardedRef()
)

ButtonGroup.propTypes = {
    alignment: PropTypes.any,
    children: PropTypes.any,
    className: PropTypes.string,
    contentClassName: PropTypes.string,
    disabled: PropTypes.any,
    framed: PropTypes.any,
    label: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

ButtonGroup.defaultProps = {
    alignment: 'left',
    layout: 'horizontal',
    spacing: 'compact'
}
