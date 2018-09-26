import PropTypes from 'prop-types'
import React from 'react'
import UnstyledSelectionList from 'widget/unstyledSelectionList'
import styles from './selectionList.module.css'

const SelectionList = (props) =>
    <UnstyledSelectionList styles={styles} {...props}/>

SelectionList.propTypes = {
    className: PropTypes.string,
    input: PropTypes.object,
    multiple: PropTypes.any,
    options: PropTypes.array,
    onChange: PropTypes.any
}

export default SelectionList
