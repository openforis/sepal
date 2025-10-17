import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {Padding} from '~/widget/padding'
import {Scrollable} from '~/widget/scrollable'

import styles from './panelContent.module.css'

class _PanelContent extends React.Component {
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

export const PanelContent = compose(
    _PanelContent,
    asFunctionalComponent({
        scrollable: true
    })
)

PanelContent.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    noHorizontalPadding: PropTypes.any,
    noVerticalPadding: PropTypes.any,
    scrollable: PropTypes.any
}
