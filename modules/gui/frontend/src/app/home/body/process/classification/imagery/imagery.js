import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'
import {msg} from 'translate'
import {activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import Icon from 'widget/icon'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../classificationRecipe'
import AddImagery from './addImagery'
import styles from './imagery.module.css'

const fields = {
    selection: new Field()
        .notEmpty('process.classification.panel.imagery.form.imagery.required'),
    recipe: new Field()
        .skip((value, {section}) => section !== 'recipe')
        .notBlank('process.classification.panel.imagery.form.recipe.required'),
    asset: new Field()
        .skip((value, {section}) => section !== 'asset')
        .notBlank('process.classification.panel.imagery.form.asset.required'),
}

class Imagery extends React.Component {
    openAdd() {
        const {activator: {activatables: {addImagery}}} = this.props
        addImagery.activate()
    }

    renderList() {
        return <div>List</div>
    }

    render() {
        const {recipeId} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'
                    onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>

                    <PanelHeader
                        icon='image'
                        title={msg('process.classification.panel.imagery.title')}/>

                    <PanelContent>
                        <div>
                            {this.renderList()}
                        </div>
                    </PanelContent>

                    <FormPanelButtons>
                        <Button
                            look={'add'}
                            icon={'plus'}
                            onClick={() => this.openAdd()}>

                        <span className={styles.label}>
                            {msg('button.add')}
                        </span>
                            <span className={styles.foo}>
                            <Icon name={'sort-up'}/>
                        </span>
                        </Button>
                    </FormPanelButtons>
                </RecipeFormPanel>

                <AddImagery/>
            </React.Fragment>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

Imagery.propTypes = {}
const additionalPolicy = () => ({addImagery: 'allow'})

// const valuesToModel = values => {}
//
// const modelToValues = (model = {}) => {}

export default activator('addImagery')(
    recipeFormPanel({id: 'imagery', fields, additionalPolicy})(
        Imagery
    )
)
