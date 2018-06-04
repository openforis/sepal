import {setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'
import {AnimateReplacement} from 'widget/animate'
import {Constraints, form} from 'widget/form'
import {RecipeState} from '../../mosaicRecipe'
import PanelButtons from '../panelButtons'
import styles from './aoi.module.css'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import PolygonSection from './polygonSection'
import SectionSelection from './sectionSelection'

const inputs = {
    section: new Constraints()
        .notBlank('process.mosaic.panel.areaOfInterest.form.section.required'),
    country: new Constraints()
        .skip((value, {section}) => section !== 'country')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Constraints(),
    fusionTable: new Constraints()
        .skip((value, {section}) => section !== 'fusionTable')
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.required'),
    fusionTableColumn: new Constraints()
        .skip((value, {section}) => section !== 'fusionTable')
        .skip((value, {fusionTable}) => !fusionTable)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.column.required'),
    fusionTableRow: new Constraints()
        .skip((value, {section}) => section !== 'fusionTable')
        .skip((value, {fusionTableColumn}) => !fusionTableColumn)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.row.required'),
    polygon: new Constraints()
        .skip((value, {section}) => section !== 'polygon')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    bounds: new Constraints()
        .notBlank('process.mosaic.panel.areaOfInterest.form.bounds.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        values: recipe('ui.aoi'),
        aoi: recipe('aoi')
    }
}

class Aoi extends React.Component {
    constructor(props) {
        super(props)
        this.initialBounds = sepalMap.getBounds()
    }

    onApply(recipe, aoiForm) {
        const {recipeId, componentWillUnmount$} = this.props
        recipe.setAoi(aoiForm).dispatch()
        setAoiLayer({
                contextId: recipeId,
                aoi: RecipeState(recipeId)('aoi'),
                fill: false,
                destroy$: componentWillUnmount$
            }
        )
    }

    onCancel() {
        const {recipeId, aoi, componentWillUnmount$} = this.props
        setAoiLayer({contextId: recipeId, aoi, fill: false, destroy$: componentWillUnmount$})
        sepalMap.fitBounds(this.initialBounds)
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
                                onApply={(recipe, aoi) => this.onApply(recipe, aoi)}
                                onCancel={() => this.onCancel()}/>
                        </div>
                    </form>
            </div>
        )
    }

    renderSections() {
        const {recipeId, form, inputs} = this.props
        switch (inputs.section.value) {
            case 'country':
                return <CountrySection recipeId={recipeId} inputs={inputs} className={styles.right}/>
            case 'fusionTable':
                return <FusionTableSection recipeId={recipeId} inputs={inputs} className={styles.right}/>
            case 'polygon':
                return <PolygonSection recipeId={recipeId} inputs={inputs} className={styles.right}/>
            default:
                return <SectionSelection recipeId={recipeId} form={form} inputs={inputs} className={styles.left}/>
        }
    }
}

Aoi.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({
        country: PropTypes.object,
        polygon: PropTypes.object
    }),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Aoi)
