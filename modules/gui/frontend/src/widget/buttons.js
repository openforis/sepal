import {Label} from 'widget/form'
import PropTypes from 'prop-types'
import React from 'react'
import UnstyledSelectionList from 'widget/unstyledSelectionList'
import styles from './buttons.module.css'

export default class Buttons extends React.Component {

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    render() {
        const {...props} = this.props
        return (
            <div>
                {this.renderLabel()}
                <UnstyledSelectionList styles={styles} {...props}/>
            </div>
        )
    }
}

Buttons.propTypes = {
    className: PropTypes.string,
    input: PropTypes.object,
    multiple: PropTypes.any,
    options: PropTypes.array,
    onChange: PropTypes.any
}
