import PropTypes from 'prop-types'
import React from 'react'

import {Padding} from '~/widget/padding'
import {Scrollable} from '~/widget/scrollable'

import styles from './panelContent.module.css'

export class PanelContent extends React.Component {
    render() {
        const {className, scrollable, noHorizontalPadding, noVerticalPadding, children} = this.props
        return scrollable
            ? (
                <Scrollable
                    direction='y'
                    containerClassName={styles.scrollable}>
                    <Padding
                        className={className}
                        noHorizontal={noHorizontalPadding}
                        noVertical={noVerticalPadding}
                    >
                        {children}
                    </Padding>
                </Scrollable>
            )
            : (
                <Padding
                    noHorizontal={noHorizontalPadding}
                    noVertical={noVerticalPadding}
                    className={[styles.nonScrollable, className].join(' ')}
                >
                    {children}
                </Padding>
            )
    }
}

PanelContent.defaultProps = {
    scrollable: true
}

PanelContent.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    noHorizontalPadding: PropTypes.any,
    noVerticalPadding: PropTypes.any,
    scrollable: PropTypes.any
}
