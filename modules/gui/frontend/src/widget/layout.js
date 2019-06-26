import PropTypes from 'prop-types'
import React from 'react'
import styles from './layout.module.css'

export class Layout extends React.Component {
    render() {
        const {type, spacing, className, style, children} = this.props
        return (
            <div className={className} style={style}>
                <div className={[
                    styles.layout,
                    type.split('-').map(className => styles[className]).join(' '),
                    styles[spacing]
                ].join(' ')}>
                    {children}
                </div>
            </div>
        )
    }
}

Layout.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    spacing: PropTypes.oneOf(['loose', 'normal', 'compact', 'none']),
    style: PropTypes.object,
    type: PropTypes.oneOf(['vertical', 'horizontal', 'horizontal-nowrap'])
}

Layout.defaultProps = {
    spacing: 'normal',
    type: 'vertical'
}
 
