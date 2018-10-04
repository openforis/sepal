import {Button} from 'widget/button'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './holdButton.module.css'

export class HoldButton extends React.Component {
    render() {
        const {icon, tabIndex, disabled, onClickHold} = this.props
        return (
            <Button
                className={styles.hold}
                icon={icon}
                tabIndex={tabIndex}
                disabled={disabled}
                stopPropagation={true}
                onClickHold={onClickHold}/>
        )
    }
}

HoldButton.propTypes = {
    children: PropTypes.any,
    disabled: PropTypes.bool,
    icon: PropTypes.string,
    tabIndex: PropTypes.number,
    onClickHold: PropTypes.func
}
