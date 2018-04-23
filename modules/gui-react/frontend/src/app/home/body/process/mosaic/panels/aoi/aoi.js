import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {AnimateReplacement} from 'widget/animate'
import {Button} from 'widget/button'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Icon from 'widget/icon'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import ConfirmationButtons from '../confirmationButtons'
import styles from './aoi.module.css'

const inputs = {
    section: new Constraints()
        .notBlank(),
    country: new Constraints()
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
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
                return <CountrySection form={form} inputs={inputs}/>
            case 'fusionTable':
                return <FusionTableSection form={form} inputs={inputs}/>
            case 'polygon':
                return <PolygonSection form={form} inputs={inputs}/>
            default:
                return <SectionSelection inputs={inputs}/>
        }
    }
}

class SectionSelection extends React.Component {
    componentWillMount() {
        const {inputs} = this.props
        Object.keys(inputs).forEach((name) => inputs[name] && inputs[name].set(''))
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

const CountrySection = ({form, inputs: {section, country}}) =>
    <Section>
        <div className={styles.header}>
            <a className={styles.icon} onClick={() => section.set('')} onMouseDown={(e) => e.preventDefault()}>
                <Icon name='arrow-left'/>
            </a>
            <span className={styles.title}><Msg id='process.mosaic.panel.areaOfInterest.form.country.title'/></span>
        </div>
        <div className={styles.body}>
            <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.label'/></label>
            <Input
                input={country}
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.country.placeholder')}
                autoFocus='on'
                autoComplete='off'
                tabIndex={1}/>
            <ErrorMessage input={country}/>
        </div>
    </Section>

const FusionTableSection = ({form, inputs: {section, country}}) =>
    <Section>
        <div className={styles.header}>
            <a className={styles.icon} onClick={() => section.set('')} onMouseDown={(e) => e.preventDefault()}>
                <Icon name='arrow-left'/>
            </a>
            <span className={styles.title}><Msg id='process.mosaic.panel.areaOfInterest.form.country.title'/></span>
        </div>
        <div className={styles.body}>
            Fusion Table Form
        </div>
    </Section>

const PolygonSection = ({form, inputs: {section, country}}) =>
    <Section>
        <div className={styles.header}>
            <a className={styles.icon} onClick={() => section.set('')} onMouseDown={(e) => e.preventDefault()}>
                <Icon name='arrow-left'/>
            </a>
            <span className={styles.title}><Msg id='process.mosaic.panel.areaOfInterest.form.polygon.title'/></span>
        </div>
        <div className={styles.body}>
            Draw a polygon
        </div>
    </Section>

Aoi.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({
        country: PropTypes.object,
    }),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Aoi)
