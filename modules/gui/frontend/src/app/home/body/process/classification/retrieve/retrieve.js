import {Field, form} from 'widget/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../classificationRecipe'
import {currentUser} from 'user'
import {msg} from 'translate'
import {withRecipePath} from 'app/home/body/process/recipe'
import Buttons from 'widget/buttons'
import FormPanel from 'widget/formPanel'
import FormPanelButtons from 'widget/formPanelButtons'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

const fields = {
    destination: new Field()
        .notEmpty('process.classification.panel.retrieve.form.destination.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState(),
        values: recipeState('ui.retrieveOptions'),
        user: currentUser()
    }
}

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)

    }

    renderContent() {
        const {user, inputs: {destination}} = this.props
        const destinationOptions = [
            {
                value: 'SEPAL',
                label: msg('process.mosaic.panel.retrieve.form.destination.SEPAL'),
                disabled: !user.googleTokens
            },
            {
                value: 'GEE',
                label: msg('process.mosaic.panel.retrieve.form.destination.GEE')
            }
        ].filter(({value}) => user.googleTokens || value !== 'GEE')

        return (
            <div className={styles.form}>
                <div>
                    <Label msg={msg('process.classification.panel.retrieve.form.destination.label')}/>
                    <Buttons
                        input={destination}
                        multiple={false}
                        options={destinationOptions}/>
                </div>

            </div>
        )
    }

    render() {
        const {recipePath, form} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                isActionForm={true}
                onApply={values => this.recipeActions.retrieve(values).dispatch()}>
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.classification.panel.retrieve.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons
                    applyLabel={msg('process.classification.panel.retrieve.apply')}/>
            </FormPanel>
        )
    }

    componentDidUpdate() {
        const {user, inputs: {destination}} = this.props
        if (!user.googleTokens && destination.value !== 'SEPAL')
            destination.set('SEPAL')
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string,
    user: PropTypes.object
}

export default withRecipePath()(
    form({fields, mapStateToProps})(Retrieve)
)
