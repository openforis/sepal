import {Field, Label, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../classificationRecipe'
import {currentUser} from 'user'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import Buttons from 'widget/buttons'
import PanelButtons from 'widget/panelButtons'
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
                    <Label>
                        <Msg id='process.classification.panel.retrieve.form.destination.label'/>
                    </Label>
                    <Buttons
                        input={destination}
                        multiple={false}
                        options={destinationOptions}/>
                </div>

            </div>
        )
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.classification.panel.retrieve.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    isActionForm={true}
                    applyLabel={msg('process.classification.panel.retrieve.apply')}
                    onApply={values => this.recipeActions.retrieve(values).dispatch()}/>
            </Panel>
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

export default form({fields, mapStateToProps})(Retrieve)
