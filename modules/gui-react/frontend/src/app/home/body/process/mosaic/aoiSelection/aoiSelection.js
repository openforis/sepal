import React from 'react'
import {Msg, msg} from 'translate'
import styles from './aoiSelection.module.css'
import PropTypes from 'prop-types'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {RecipeActions} from '../mosaicRecipe'

const inputs = {
    country: new Constraints()
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
}

const mapStateToProps = () => ({})

class AoiSelection extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }
    apply(e, values) {
        e.preventDefault()
        this.recipe.setAoi(values)
    }
    discard(e) {
        e.preventDefault()
    }
    render() {
        const {className, form, inputs: {country}} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
                    <div>
                        <Msg id={'process.mosaic.panel.areaOfInterest.title'}/>
                    </div>
                    <form>
                        <div>
                            <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.label'/></label>
                            <Input
                                input={country}
                                placeholder={msg('process.mosaic.panel.areaOfInterest.form.country.placeholder')}
                                autoFocus='on'
                                autoComplete='off'
                                tabIndex={1}/>
                            <ErrorMessage input={country}/>
                        </div>
                        <div className={styles.buttons}>
                            <button
                                onClick={(e) => this.apply.bind(this)(e, form.values())}
                                disabled={form.hasInvalid()}
                                tabIndex={2}>
                                <Msg id='button.apply'/>
                            </button>
                            <button onClick={this.discard.bind(this)}>
                                <Msg id='button.discard'/>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }
}

AoiSelection.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({
        country: PropTypes.object,
    }),
    action: PropTypes.func,
}

export default form(inputs, mapStateToProps)(AoiSelection)
