import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'

import styles from './layout.module.css'

const typeClassNames = (type = '') =>
    type.split('-').map(className => styles[className])

class _Layout extends React.Component {
    render() {
        const {forwardedRef, type, spacing, alignment, framed, shrink, className, contentClassName, style, onClick, onMouseOver, onMouseOut, children} = this.props
        return (
            <div
                ref={forwardedRef}
                className={[
                    styles.layout,
                    ...typeClassNames(type),
                    styles[`spacing-${spacing}`],
                    styles[`alignment-${alignment}`],
                    framed ? styles.framed : null,
                    shrink ? styles.shrink : null,
                    className
                ].join(' ')}
                style={style}
                onClick={onClick}
                onMouseEnter={onMouseOver}
                onMouseLeave={onMouseOut}>
                <div className={[
                    styles.content,
                    contentClassName
                ].join(' ')}>
                    {children}
                </div>
            </div>
        )
    }
}

export const Layout = compose(
    _Layout,
    asFunctionalComponent({
        alignment: 'spaced',
        spacing: 'normal',
        type: 'vertical'
    })
)

Layout.propTypes = {
    alignment: PropTypes.oneOf(['left', 'center', 'right', 'spaced', 'fill', 'distribute']),
    children: PropTypes.any,
    className: PropTypes.string,
    contentClassName: PropTypes.string,
    framed: PropTypes.any,
    // Allow a constrained vertical layout to shrink below its content's intrinsic width.
    shrink: PropTypes.bool,
    spacing: PropTypes.oneOf(['loose', 'normal', 'normal-separated', 'compact', 'compact-separated', 'tight', 'none']),
    style: PropTypes.object,
    type: PropTypes.oneOf(['vertical', 'vertical-fill', 'vertical-scrollable', 'horizontal', 'horizontal-nowrap']),
    onClick: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

class LayoutSpacer extends React.Component {
    render() {
        return (
            <div className={styles.spacer}/>
        )
    }
}

Layout.Spacer = LayoutSpacer
