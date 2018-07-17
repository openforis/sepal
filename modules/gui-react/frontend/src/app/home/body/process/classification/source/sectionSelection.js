import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import styles from './sectionSelection.module.css'

export default class SectionSelection extends React.Component {
    render() {
        const {inputs: {section}} = this.props
        const options = [
            {
                value: 'recipe',
                label: msg('process.classification.panel.source.recipe.title')
            },
            {
                value: 'asset',
                label: msg('process.classification.panel.source.asset.title')
            }
        ]
        return (
            <Buttons
                className={styles.sectionSelection}
                input={section}
                options={options}/>
        )
    }
}

SectionSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired
}