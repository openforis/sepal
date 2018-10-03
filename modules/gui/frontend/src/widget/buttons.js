import PropTypes from 'prop-types'
import React from 'react'
import UnstyledSelectionList from 'widget/unstyledSelectionList'
import styles from './buttons.module.css'

const Buttons = (props) => <UnstyledSelectionList styles={styles} {...props}/>

Buttons.propTypes = {
    className: PropTypes.string,
    input: PropTypes.object,
    multiple: PropTypes.any,
    options: PropTypes.array,
    onChange: PropTypes.any
}

export default Buttons
