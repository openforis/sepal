import PropTypes from 'prop-types'
import React from 'react'
import styles from './layout.module.css'

const typeClassNames = type =>
    type.split('-').map(className => styles[className])

export class Layout extends React.Component {
    render() {
        const {type, spacing, framed, scrollable, className, style, onClick, onMouseOver, onMouseOut, children} = this.props
        return (
            <div
                className={[
                    styles.layout,
                    ...typeClassNames(type),
                    styles[spacing],
                    framed ? styles.framed : null,
                    scrollable ? styles.scrollable : null,
                    className
                ].join(' ')}
                style={style}
                onClick={onClick}
                onMouseEnter={onMouseOver}
                onMouseLeave={onMouseOut}>
                <div className={styles.content}>
                    {children}
                </div>
            </div>
        )
    }
}

Layout.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    framed: PropTypes.any,
    scrollable: PropTypes.any,
    spacing: PropTypes.oneOf(['loose', 'normal', 'compact', 'tight', 'none']),
    style: PropTypes.object,
    type: PropTypes.oneOf(['vertical', 'horizontal', 'horizontal-nowrap']),
    onClick: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

Layout.defaultProps = {
    spacing: 'normal',
    type: 'vertical'
}
