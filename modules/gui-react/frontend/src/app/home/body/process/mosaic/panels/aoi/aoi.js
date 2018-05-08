import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {AnimateReplacement} from 'widget/animate'
import {Button} from 'widget/button'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {RecipeState} from '../../mosaicRecipe'
import ConfirmationButtons from '../confirmationButtons'
import styles from './aoi.module.css'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import PolygonSection from './polygonSection'
import SectionSelection from './sectionSelection'

const inputs = {
    section: new Constraints()
        .notBlank('some.key'),
    country: new Constraints()
        .predicate((country, {section}) =>
            section !== 'country' || !!country,
            'process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Constraints(),
    polygon: new Constraints()
        .predicate((polygon, {section}) =>
            section !== 'polygon' || !!polygon,
            'process.mosaic.panel.areaOfInterest.form.country.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('aoi')
    }
}

class Aoi extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
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
                            <ConfirmationButtons recipeId={id} form={form} recipe={this.recipe}/>
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
                return <CountrySection id={id} inputs={inputs} className={styles.right}/>
            case 'fusionTable':
                return <FusionTableSection inputs={inputs} className={styles.right}/>
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
