import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Icon from 'widget/icon'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import ConfirmationButtons from '../confirmationButtons'
import styles from './aoi.module.css'

const inputs = {
    section: new Constraints()
        .notBlank('asdf'), // TODO: Error message needed?
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
                        <div>
                            <SectionSelection section={inputs.section}/>
                            <Section selected={inputs.section.value === 'country'}>
                                <CountrySection form={form} inputs={inputs}/>
                            </Section>
                        </div>
                        <div className={styles.buttons}>
                            <ConfirmationButtons form={form} recipe={this.recipe}/>
                        </div>
                    </form>
                </div>
            </div>
        )
    }
}

const SectionSelection = ({section}) =>
    <div className={[styles.typeSection, section.value ? styles.hide : null].join(' ')}>
        <div className={styles.header}>
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

const SectionOption = ({label, value, section}) =>
    <div onClick={() => section.set(value)}>
        {label}
    </div>

const Section = ({children, selected}) =>
    <div className={[styles.section, selected ? null : styles.hide].join(' ')}>
        {children}
    </div>

const CountrySection = ({form, inputs: {section, country}}) =>
    <div className={styles.countrySection}>
        <div className={styles.header}>
            <span className={styles.back} onClick={() => section.set('')}>
                <Icon name='arrow-left'/>
            </span>
            <span className={styles.title}>{'Select country/province'}</span>
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
    </div>

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
