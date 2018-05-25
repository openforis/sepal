import {map} from 'app/home/map/map'
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
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('ui.aoi')
    }
}

class Aoi extends React.Component {
    constructor(props) {
        super(props)
        this.initialBounds = map.getBounds()
    }

    onCancel() {
        map.fitBounds(this.initialBounds)
    }

    render() {
        console.log('render aoi')
        const {id, className, form, inputs} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
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
                                recipeId={id}
                                form={form}
                                onApply={(recipe, aoi) => recipe.setAoi(aoi).dispatch()}
                                onCancel={() => this.onCancel()}/>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    renderSections() {
        const {id, form, inputs} = this.props
        switch (inputs.section.value) {
            case 'country':
                return <CountrySection inputs={inputs} className={styles.right}/>
            case 'fusionTable':
                return <FusionTableSection id={id} inputs={inputs} className={styles.right}/>
            case 'polygon':
                return <PolygonSection inputs={inputs} className={styles.right}/>
            default:
                return <SectionSelection form={form} inputs={inputs} className={styles.left}/>
        }
    }
}

Aoi.propTypes = {
    id: PropTypes.string,
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
