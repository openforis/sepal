import {setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {AnimateReplacement} from 'widget/animate'
import {Field, form} from 'widget/form'
import {RecipeState} from '../../mosaicRecipe'
import PanelButtons from '../panelButtons'
import styles from './aoi.module.css'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import PolygonSection from './polygonSection'
import SectionSelection from './sectionSelection'

const fields = {
    section: new Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.section.required'),
    country: new Field()
        .skip((value, {section}) => section !== 'country')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Field(),
    fusionTable: new Field()
        .skip((value, {section}) => section !== 'fusionTable')
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.required'),
    fusionTableColumn: new Field()
        .skip((value, {section}) => section !== 'fusionTable')
        .skip((value, {fusionTable}) => !fusionTable)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.column.required'),
    fusionTableRow: new Field()
        .skip((value, {section}) => section !== 'fusionTable')
        .skip((value, {fusionTableColumn}) => !fusionTableColumn)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.row.required'),
    polygon: new Field()
        .skip((value, {section}) => section !== 'polygon')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    bounds: new Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.bounds.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        values: recipeState('ui.aoi'),
        aoi: recipeState('aoi'),
        initialized: recipeState('ui.initialized'),
        labelsShown: recipeState('ui.labelsShown')
    }
}

class Aoi extends React.Component {
    constructor(props) {
        super(props)
        this.aoiUnchanged = true
        this.initialAoi = props.aoi
        this.initialBounds = sepalMap.getBounds()
        this.initialZoom = sepalMap.getZoom()
    }

    onApply(recipe, aoiForm) {
        const {recipeId, componentWillUnmount$} = this.props
        this.initialBounds = aoiForm.bounds
        recipe.setAoi(aoiForm).dispatch()
        const aoi = RecipeState(recipeId)('aoi')
        this.aoiUnchanged = _.isEqual(aoi, this.initialAoi)
        setAoiLayer({
                contextId: recipeId,
                aoi: aoi,
                fill: false,
                destroy$: componentWillUnmount$
            }
        )
    }

    render() {
        const {recipeId, className, form, inputs} = this.props
        return (
            <div className={[className, styles.container].join(' ')}>
                <form>
                    <div className={styles.sections}>
                        <AnimateReplacement
                            currentKey={inputs.section.value}
                            timeout={250}
                            classNames={{enter: styles.enter, exit: styles.exit}}>
                            {this.renderSections()}
                        </AnimateReplacement>
                    </div>
                    <div className={styles.buttons}>
                        <PanelButtons
                            recipeId={recipeId}
                            form={form}
                            onApply={(recipe, aoi) => this.onApply(recipe, aoi)}/>
                    </div>
                </form>
            </div>
        )
    }

    renderSections() {
        const {recipeId, labelsShown, form, inputs} = this.props
        switch (inputs.section.value) {
            case 'country':
                return <CountrySection
                    recipeId={recipeId}
                    inputs={inputs}
                    className={styles.right}/>
            case 'fusionTable':
                return <FusionTableSection
                    recipeId={recipeId}
                    inputs={inputs}
                    className={styles.right}/>
            case 'polygon':
                return <PolygonSection
                    recipeId={recipeId}
                    inputs={inputs}
                    labelsShown={labelsShown}
                    className={styles.right}/>
            default:
                return <SectionSelection
                    recipeId={recipeId}
                    form={form}
                    inputs={inputs}
                    className={styles.left}/>
        }
    }

    componentWillUnmount() {
        const {recipeId} = this.props
        const recipe = RecipeState(recipeId)
        setAoiLayer({
                contextId: recipeId,
                aoi: recipe && recipe('aoi'),
                fill: false
            }
        )
        if (this.aoiUnchanged) {
            sepalMap.fitBounds(this.initialBounds)
            sepalMap.setZoom(this.initialZoom)
        }
    }
}

Aoi.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, mapStateToProps})(Aoi)
