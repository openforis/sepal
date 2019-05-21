import {FormButtons as Buttons} from 'widget/buttons'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sectionSelection.module.css'

export default class SectionSelection extends React.Component {
    render() {
        const {section} = this.props
        const options = [
            {
                value: 'RECIPE_REF',
                label: msg('process.classification.panel.inputImagery.recipe.title')
            },
            {
                value: 'ASSET',
                label: msg('process.classification.panel.inputImagery.asset.title')
            },
        ]
        return (
            <Buttons
                type='vertical'
                className={styles.sectionSelection}
                input={section}
                options={options}/>
        )
    }
}

SectionSelection.propTypes = {
    section: PropTypes.object.isRequired
}
