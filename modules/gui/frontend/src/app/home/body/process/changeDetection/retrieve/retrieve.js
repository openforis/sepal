import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../changeDetectionRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {currentUser} from 'widget/user'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

const fields = {
    destination: new Field()
        .notEmpty('process.changeDetection.panel.retrieve.form.destination.required')
}

class Retrieve extends React.Component {
    renderContent() {
        const {inputs: {destination}} = this.props
        const user = currentUser()
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
            <React.Fragment>
                <div>
                    <Label msg={msg('process.changeDetection.panel.retrieve.form.destination.label')}/>
                    <Buttons
                        input={destination}
                        multiple={false}
                        options={destinationOptions}/>
                </div>
            </React.Fragment>
        )
    }

    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => RecipeActions(recipeId).retrieve(values).dispatch()}>
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.changeDetection.panel.retrieve.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons
                    applyLabel={msg('process.changeDetection.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    componentDidUpdate() {
        const {inputs: {destination}} = this.props
        const user = currentUser()
        if (!user.googleTokens && destination.value !== 'SEPAL')
            destination.set('SEPAL')
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string,
    user: PropTypes.object
}

export default recipeFormPanel({id: 'retrieve', fields})(Retrieve)
