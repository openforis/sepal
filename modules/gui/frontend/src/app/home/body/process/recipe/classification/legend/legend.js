import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {MosaicPreview} from '../../mosaic/mosaicPreview'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import guid from 'guid'
import styles from './legend.module.css'

const legendFields = {
    entries: new Form.Field()
        .predicate(value => {
            const hasEntries = value && value.length
            if (!hasEntries)
                return false
            const hasInvalidEntry = value.find(entry => !isValid(entry)) || false
            if (hasInvalidEntry)
                return !hasInvalidEntry
            const hasDuplicates = !!findDuplicates(value).length
            return !hasDuplicates
        }, 'process.classification.panel.inputImagery.form.section.required')
}

const mapRecipeToProps = recipe => {
    const dataSets = selectFrom(recipe, 'model.trainingData').dataSets || []

    return ({
        hasTrainingData: !!dataSets.find(dataSet => dataSet.type !== 'COLLECTED' || !_.isEmpty(dataSet.referenceData))
    })
}

class Legend extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.preview = MosaicPreview(recipeId)
    }

    render() {
        const {dataCollectionEvents} = this.props
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}
                onApply={() => setTimeout(() => dataCollectionEvents.updateAll())}
                onClose={() => this.preview.show()}>
                <Panel.Header
                    icon='list'
                    title={msg('process.classification.panel.legend.title')}/>

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons>
                    <Panel.Buttons.Add onClick={() => this.addEntry()}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {hasTrainingData, inputs: {entries}} = this.props
        const duplicates = findDuplicates((entries.value || []))
        return (
            <Layout>
                {(entries.value || []).map(entry =>
                    <Layout key={entry.id} type={'horizontal-nowrap'}>
                        <Entry
                            entry={entry}
                            duplicate={duplicates.find(duplicate => duplicate.id === entry.id) || {}}
                            hasTrainingData={hasTrainingData}
                            onChange={entry => this.updateEntry(entry)}
                        />
                        <RemoveButton
                            message={'Are you sure you want to remove this legend entry?'}
                            disabled={hasTrainingData}
                            onRemove={() => this.removeEntry(entry)}/>
                    </Layout>
                )}
            </Layout>
        )
    }

    componentDidMount() {
        this.preview.hide()
    }

    updateEntry(updatedEntry) {
        const {inputs: {entries}} = this.props
        const updatedEntries = entries.value.map(entry => entry.id === updatedEntry.id ? updatedEntry : entry)
        entries.set(updatedEntries)
    }

    removeEntry(entry) {
        const {inputs: {entries}} = this.props
        entries.set(
            entries.value.filter(({id}) => id !== entry.id)
        )
    }

    addEntry() {
        const {inputs: {entries}} = this.props
        const entryCount = entries.value ? entries.value.length : 0
        const id = guid()
        const value = entryCount
            ? _.maxBy(entries.value, 'value').value + 1
            : 1
        const color = value > 0 && value <= COLORS.length
            ? COLORS[value - 1]
            : COLORS.length > entryCount
                ? COLORS[entryCount]
                : '#FFB300'
        const entry = {id, value, color, label: ''}
        entries.set(
            [...entries.value, entry]
        )
    }
}

class _Entry extends React.Component {
    render() {
        const {entry, hasTrainingData, inputs: {value, color, label}} = this.props
        return (
            <Layout type={'horizontal-nowrap'}>
                <Form.Input
                    className={styles.color}
                    type='color'
                    input={color}
                    errorMessage
                    autoComplete={false}
                    onChange={e => this.notifyChange({color: e.target.value})}
                />
                <Form.Input
                    className={styles.value}
                    maxLength={2}
                    input={value}
                    errorMessage
                    autoComplete={false}
                    disabled={hasTrainingData}
                    onChange={e => this.notifyChange({value: e.target.value})}
                />
                <Form.Input
                    className={styles.label}
                    input={label}
                    placeholder={'Class label'}
                    autoFocus={!entry.label}
                    errorMessage
                    autoComplete={false}
                    onChange={e => {
                        this.notifyChange({label: e.target.value})
                    }}
                />
            </Layout>
        )
    }

    componentDidMount() {
        const {entry, inputs: {value, color, label, duplicate}} = this.props
        value.set(entry.value)
        color.set(entry.color)
        label.set(entry.label)
        duplicate.set(this.props.duplicate)
    }

    componentDidUpdate() {
        const {inputs: {duplicate}} = this.props
        duplicate.set(this.props.duplicate)
    }

    notifyChange({color, value, label}) {
        const {entry, onChange, inputs} = this.props
        const updatedEntry = {
            id: entry.id,
            color: color === undefined ? inputs.color.value : color,
            value: parseInt(value === undefined ? inputs.value.value : value),
            label: label === undefined ? inputs.label.value : label
        }
        onChange(updatedEntry)
    }
}

const entryFields = {
    duplicate: new Form.Field(),
    value: new Form.Field()
        .notBlank('process.classification.panel.inputImagery.form.section.required')
        .predicate((value, {duplicate}) => !duplicate.value, 'process.classification.panel.inputImagery.form.section.required'),
    color: new Form.Field()
        .notBlank('process.classification.panel.inputImagery.form.section.required')
        .predicate((color, {duplicate}) => !duplicate.color, 'process.classification.panel.inputImagery.form.section.required'),
    label: new Form.Field()
        .notBlank('process.classification.panel.inputImagery.form.section.required')
        .predicate((label, {duplicate}) => !duplicate.label, 'process.classification.panel.inputImagery.form.section.required')
}

const Entry = compose(_Entry, form({fields: entryFields}))

Legend.propTypes = {
    dataCollectionEvents: PropTypes.object.isRequired,
    recipeId: PropTypes.string,
}

export default compose(
    Legend,
    recipeFormPanel({id: 'legend', fields: legendFields, mapRecipeToProps})
)

const
    COLORS = [
        '#FFB300',  // Vivid Yellow
        '#803E75',  // Strong Purple
        '#FF6800',  // Vivid Orange
        '#A6BDD7',  // Very Light Blue
        '#C10020',  // Vivid Red
        '#CEA262',  // Grayish Yellow
        '#817066',  // Medium Gray
        '#007D34',  // Vivid Green
        '#F6768E',  // Strong Purplish Pink
        '#00538A',  // Strong Blue
        '#FF7A5C',  // Strong Yellowish Pink
        '#53377A',  // Strong Violet
        '#FF8E00',  // Vivid Orange Yellow
        '#B32851',  // Strong Purplish Red
        '#F4C800',  // Vivid Greenish Yellow
        '#7F180D',  // Strong Reddish Brown
        '#93AA00',  // Vivid Yellowish Green
        '#593315',  // Deep Yellowish Brown
        '#F13A13',  // Vivid Reddish Orange
        '#232C16'  // Dark Olive Green
    ]

const isValid = entry => {
    const validValue = _.inRange(entry.value, 0, 100)
    const validColor = !!entry.color
    const validLabel = !!entry.label
    return validValue && validColor && validLabel
}

const findDuplicates = entries =>
    entries
        .map(entry => {
            const otherEntries = entries.filter(({id}) => entry.id !== id)
            return {
                id: entry.id,
                value: !!otherEntries.filter(({value}) => value === entry.value).length,
                color: !!otherEntries.filter(({color}) => color === entry.color).length,
                label: !!otherEntries.filter(({label}) => label === entry.label).length
            }
        })
        .filter(({value, color, label}) => value || color || label)
