import {Layout} from './layout'
import {Widget} from './widget'
import {compose} from 'compose'
import Label from './label'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withForwardedRef from 'ref'

const _ButtonGroup = ({className, layout, alignment, spacing, framed, label, disabled, onMouseOver, onMouseOut, forwardedRef, children}) => {
    const mapChild = (child, index, childrenCount) =>
        React.cloneElement(child, {
            joinLeft: index !== 0,
            joinRight: index !== childrenCount - 1
        })

    const mapChildren = children =>
        React.Children.map(children, (child, index) =>
            mapChild(child, index, children.length)
        )

    const buttons = (
        <Widget
            ref={forwardedRef}
            className={className}
            layout={layout}
            alignment={alignment}
            spacing={spacing}
            framed={framed}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}>
            {spacing === 'none' ? mapChildren(children) : children}
        </Widget>
    )

    return label
        ? (
            <Layout spacing={spacing}>
                <Label disabled={disabled}>{label}</Label>
                {buttons}
            </Layout>
        )
        : buttons
}

export const ButtonGroup = compose(
    _ButtonGroup,
    withForwardedRef()
)

ButtonGroup.propTypes = {
    alignment: PropTypes.any,
    children: PropTypes.any,
    className: PropTypes.string,
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
