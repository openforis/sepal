import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {AnimateReplacement} from 'widget/animate'
import {Button} from 'widget/button'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Icon from 'widget/icon'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import ConfirmationButtons from '../confirmationButtons'
import CountrySection from './countrySection'
import PolygonSection from './polygonSection'
import FusionTableSection from './fusionTableSection'
import styles from './aoi.module.css'
import {map} from '../../../../../map/map'

const inputs = {
    section: new Constraints()
        .notBlank('some.key'),
    country: new Constraints()
        .predicate((country, { section }) =>
            section !== 'country' || !!country,
        'process.mosaic.panel.areaOfInterest.form.country.required'),
    polygon: new Constraints()
        .predicate((polygon, { section }) =>
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
        this.recipe = RecipeActions(props.id)
    }

    render() {
        const {className, form, inputs} = this.props
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
                            <ConfirmationButtons form={form} recipe={this.recipe}/>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    renderSections() {
        const {form, inputs} = this.props
        switch (inputs.section.value) {
        case 'country':
            return <Section><CountrySection form={form} inputs={inputs}/></Section>
        case 'fusionTable':
            return <Section><FusionTableSection form={form} inputs={inputs}/></Section>
        case 'polygon':
            return <Section><PolygonSection form={form} inputs={inputs}/></Section>
        default:
            return <SectionSelection inputs={inputs}/>
        }
    }
}

class SectionSelection extends React.Component {
    componentWillMount() {
        const {inputs} = this.props
        Object.keys(inputs).forEach((name) => inputs[name] && inputs[name].set(''))
        map.removeMapObject('aoi')
    }

    render() {
        const {inputs: {section}} = this.props
        return (
            <div className={styles.left}>
                <div className={styles.header}>
                    <span className={styles.icon}>
                        <Icon name='cog'/>
                    </span>
                    <span className={styles.title}>
                        <Msg id={'process.mosaic.panel.areaOfInterest.title'}/>
                    </span>
                </div>
                <div className={styles.body}>
                    <SectionOption section={section} label={'Select country/province'} value='country'/>
                    <SectionOption section={section} label={'Select from Fusion Table'} value='fusionTable'/>
                    <SectionOption section={section} label={'Draw polygon'} value='polygon'/>
                </div>
            </div>
        )
    }
}

const SectionOption = ({label, value, section}) =>
    <Button onClick={() => section.set(value)} className={styles.sectionOption}>
        {label}
    </Button>

const Section = ({children}) =>
    <div className={styles.right}>
        {children}
    </div>

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
