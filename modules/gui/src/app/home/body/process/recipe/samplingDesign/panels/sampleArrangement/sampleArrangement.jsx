import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import styles from './sampleArrangement.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || []
})

const fields = {
}

class _SampleArrangement extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='border-none'
                    title={msg('process.samplingDesign.panel.sampleArrangement.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return 'some content'
    }

}

const valuesToModel = values => {
    return values
}

const modelToValues = model => {
    return model
}

export const SampleArrangement = compose(
    _SampleArrangement,
    recipeFormPanel({id: 'sampleArrangement', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleArrangement.propTypes = {
    recipeId: PropTypes.string
}
