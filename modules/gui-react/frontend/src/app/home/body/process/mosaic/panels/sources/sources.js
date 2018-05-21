import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import styles from './sources.module.css'
import PanelForm from '../panelForm'
import {Constraints, ErrorMessage, form, Input, Label} from 'widget/form'
import {imageSources, imageSourceById} from 'sources'
import Buttons from 'widget/buttons'

const inputs = {
    source: new Constraints()
        .notEmpty('process.mosaic.panel.sources.form.source.required'),
    dataSets: new Constraints()
        .notEmpty('process.mosaic.panel.sources.form.dataSets.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('sources')
    }
}

class Sources extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }

    renderSources() {
        const {inputs: {source}} = this.props
        const options = imageSources.map((value) => 
            ({value, label: msg(['process.mosaic.panel.sources.form.source', value])})
        )
        return (
            <Buttons
                className={styles.sources}
                input={source}
                options={options}/>
        )
    }

    renderDataSets() {
        const render = (content) => <div className={styles.dataSets}>{content}</div>

        const {inputs: {source, dataSets}} = this.props
        if (!source.value)
            return render()
        const dataSetNames = imageSourceById[source.value].dataSets
        if (!dataSetNames)
            return render()
        const options = dataSetNames.map((value) => 
            ({
                value, 
                label: msg(['process.mosaic.panel.sources.form.dataSet', value, 'label']),
                // tooltip: ['process.mosaic.panel.sources.form.dataSet', value],
            })
        )
        return render(
            dataSetNames.length > 1
                ? <Buttons className={styles.dataSets} input={dataSets} options={options} multiple/>
                : null
        )
    }

    render() {
        const {className, id, form} = this.props
        return (
            <div className={className}>
                <form className={styles.container}>
                    <PanelForm
                        recipeId={id}
                        form={form}
                        onApply={(recipe, sources) => recipe.setSources(sources).dispatch()}
                        icon='cog'
                        title={msg('process.mosaic.panel.sources.title')}
                        className={styles.form}>
                    
                        {this.renderSources()}
                        {this.renderDataSets()}

                        {/* <Label
                        tooltip='process.mosaic.panel.dates.form.targetDate'
                        right>
                        <Msg id='process.mosaic.panel.dates.form.targetDate.label'/>
                    </Label> */}

                    </PanelForm>
                </form>
            </div>
        )
    }
}

Sources.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Sources)

