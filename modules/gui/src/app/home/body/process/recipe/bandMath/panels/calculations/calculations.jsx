import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './calculations.module.css'

const mapRecipeToProps = recipe => {
    return ({
        calculations: selectFrom(recipe, 'model.calculations.calculations')
    })
}

class _Calculations extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='calculator'
                    title={msg('process.bandMath.panel.calculations.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout>
                
            </Layout>
        )
    }
}

const additionalPolicy = () => ({
    _: 'disallow'
})

export const Calculations = compose(
    _Calculations,
    recipeFormPanel({id: 'calculations', mapRecipeToProps, additionalPolicy}),
)

Calculations.propTypes = {
    recipeId: PropTypes.string,
    onChange: PropTypes.func,
}
