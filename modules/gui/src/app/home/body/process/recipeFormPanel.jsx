import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {initValues} from '~/app/home/body/process/recipe'
import {OutputCandidate} from '~/app/home/body/process/recipe/outputCandidate'
import {SourceCandidate} from '~/app/home/body/process/recipe/sourceCandidate'
import {sourceInputFeedback} from '~/app/home/body/process/recipe/sourceInputFeedback'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {FormContext} from '~/widget/form/context'
import {withForm} from '~/widget/form/form'
import {withInputFeedback} from '~/widget/form/inputFeedback'
import {withPanelWizard} from '~/widget/panelWizard'

const Context = React.createContext()

const defaultPolicy = ({values, panelWizard: {wizard}}) =>
    wizard || selectFrom(values, 'dirty')
        ? {_: 'disallow'}
        : {_: 'allow-then-deactivate'}

// What may open beside a form panel (widget/activation/activationPolicy.js): its policy - by default nothing over a set-up
// wizard or unapplied edits, and otherwise anything, which closes it - with what the panel adds by id.
export const recipeFormPanelPolicy = ({policy = defaultPolicy, additionalPolicy = () => ({})} = {}) =>
    props => ({...policy(props), ...additionalPolicy(props)})

export const recipeFormPanel = (
    {
        id,
        fields,
        constraints,
        path,
        mapRecipeToProps = () => ({}),
        modelToValues = model => ({...model}),
        valuesToModel = values => ({...values}),
        policy = defaultPolicy,
        additionalPolicy = () => ({})
    }) => {
    path = path || (() => id)
    const createMapRecipeToProps = mapRecipeToProps => {
        return (recipe, props) => {
            const evaluatedPath = path(props)
            if (!evaluatedPath) {
                return null
            }
            const additionalProps = mapRecipeToProps(recipe)
            const model = selectFrom(recipe, ['model', evaluatedPath])
            const values = selectFrom(recipe, ['ui', evaluatedPath])
            return {recipeId: recipe.id, model, values, ...additionalProps}
        }
    }

    const valuesSpec = {
        getModel: props => props.model,
        getValues: props => props.values,
        modelToValues,
        onInitialized: ({values, props}) => {
            const {recipeStatePath: statePath} = props
            const evaluatedPath = path(props)
            setValues({evaluatedPath, statePath, values})
        }
    }

    // A panel whose id names a section the recipe's type declares source requirements for judges its values by them
    // before they are applied (sourceCandidate.js). What it finds holds Apply back as an invalid field does, and is told
    // to the form input the section declares (`section.input`, sourceRequirements.js) as that input's feedback
    // (inputFeedback.js) - for a section configuring something depending on the source, the input of the setting its
    // refusal asks to change. A section declaring none says what is wrong with its settings on its toolbar button alone. Requirements over the recipe's own configuration
    // (`localFacts`) judge what was applied, not what is being edited: they bind no panel.
    const sourceSectionOf = props => {
        const declarations = getRecipeType(select(['process.loadedRecipes', props.recipeId, 'type']))?.sourceRequirements || []
        return declarations.find(({role, section}) => role && section.id === id)?.section || null
    }

    // A panel a requirement its recipe's output read judges names as the editor of one item (`editor.panel`) judges its
    // values by that requirement, over the recipe built from that item alone (outputCandidate.js): what it finds is told
    // to `editor.input` and holds Apply back - or, where `editor.input` is a function of a finding and the values, to the
    // input it names for each, as `editor.describe(findings, values)` says them. Pending or failed, it holds nothing
    // back. Multiple declarations may explain different fields; presentation-only declarations opt out of holding Apply.
    const outputEditorsOf = props => {
        const declarations = getRecipeType(select(['process.loadedRecipes', props.recipeId, 'type']))?.sourceRequirements || []
        return declarations.filter(({outputDiagnostics, editor}) => outputDiagnostics && editor?.panel === id)
    }

    const outputCandidateOf = (declaration, props, onChange) => {
        const {recipeId, sourceRuntime} = props
        return declaration && sourceRuntime
            ? new OutputCandidate({sourceRuntime, recipeId, declaration, valuesToModel, onChange})
            : null
    }

    const sourceCandidateOf = (section, props, onChange) => {
        const {recipeId, sourceRuntime} = props
        return section
            ? new SourceCandidate({sourceRuntime, recipeId, section: id, path: path(props), valuesToModel, onChange})
            : null
    }

    return WrappedComponent => {
        const policyToApply = recipeFormPanelPolicy({policy, additionalPolicy})
        // [HACK] Using withRecipe() twice.
        // withActivatable() is dependent on recipe for its policy -> withRecipe() before withActivatable()
        // withRecipe() is dependent on activatable props -> withActivatable() before withRecipe()
        return compose(
            class RecipeFormPanelHOC extends React.Component {
                state = {}

                constructor(props) {
                    super(props)
                    const {values, recipeStatePath: statePath, form} = props
                    this.prevValues = values
                    this.sourceSection = sourceSectionOf(props)
                    this.sourceCandidate = sourceCandidateOf(this.sourceSection, props, () => this.mounted && this.setState(
                        ({sourceCandidateChanges = 0}) => ({sourceCandidateChanges: sourceCandidateChanges + 1})
                    ))
                    this.outputEditors = outputEditorsOf(props).map(declaration => ({
                        declaration,
                        candidate: outputCandidateOf(declaration, props, () => this.mounted && this.setState(
                            ({outputCandidateChanges = 0}) => ({outputCandidateChanges: outputCandidateChanges + 1})
                        ))
                    }))
    
                    form.onDirtyChanged(dirty => setDirty({evaluatedPath: path(props), statePath, dirty}))
                }
    
                render() {
                    const {recipeStatePath: statePath, activatable: {deactivate}} = this.props
                    const form = this.form()
                    return (
                        <Context.Provider value={{
                            id,
                            evaluatedPath: path(this.props),
                            form,
                            sourceCandidate: this.sourceCandidate,
                            outputEditors: this.outputEditors,
                            statePath,
                            // List panels deliberately have no serializer: their entries are already applied.
                            valuesToModel: valuesToModel && this.props.modelToApply
                                ? values => this.props.modelToApply(valuesToModel(values), this.props.model) : valuesToModel,
                            deactivate,
                            prevValues: this.prevValues
                        }}>
                            <FormContext form={form}>
                                {React.createElement(WrappedComponent, {...this.props, form, sourceCandidate: this.sourceCandidate,
                                    inputs: this.props.presentInputs ? this.props.presentInputs(this.props.inputs, modelToValues) : this.props.inputs})}
                            </FormContext>
                        </Context.Provider>
                    )
                }

                // A declaration waiting while a set-up wizard has its section open as its step (`wizardStepMark: false`,
                // sourceRequirements.js) says what it finds there only beside an input already saying its own error: as
                // the input's own validation does, once it has been interacted with. So does one restating an input's own
                // required rule (`editor.quietWhileEdited`) for an input the draft has changed: what the draft left
                // incomplete is work not yet done, while what was saved incomplete is said at once.
                presented(declaration, feedback) {
                    const {form, inputs, panelWizard} = this.props
                    const atStep = declaration.wizardStepMark === false && panelWizard?.wizard && panelWizard.step === declaration.section.id
                    if (!atStep && !declaration.editor.quietWhileEdited) {
                        return feedback
                    }
                    const waits = name => atStep || inputs?.[name]?.isDirty()
                    return _.pickBy(feedback, (_feedback, name) => !waits(name) || form.getErrorMessage(name))
                }

                componentDidMount() {
                    this.mounted = true
                    this.sourceCandidate?.update(this.props.form.values())
                    this.outputEditors.forEach(({candidate}) => candidate?.update(this.props.form.values()))
                }

                componentDidUpdate() {
                    this.sourceCandidate?.update(this.props.form.values())
                    this.outputEditors.forEach(({candidate}) => candidate?.update(this.props.form.values()))
                }

                componentWillUnmount() {
                    this.mounted = false
                    this.sourceCandidate?.stop()
                    this.outputEditors.forEach(({candidate}) => candidate?.stop())
                }

                form() {
                    const {form} = this.props
                    const sourceCandidate = this.sourceCandidate
                    const outputEditors = this.outputEditors
                    if (!sourceCandidate && !outputEditors.length) {
                        return form
                    }
                    const sourceInput = sourceCandidate && this.sourceSection.input?.(form.values(), sourceCandidate.refusal())
                    const sourceFeedback = sourceCandidate && sourceInputFeedback(sourceCandidate.status(), () => sourceCandidate.refresh())
                    const outputFeedback = outputEditors.reduce((feedback, {declaration, candidate}) => {
                        const findings = candidate?.findings()
                        return findings
                            ? _.mergeWith(feedback, this.presented(declaration, outputFeedbackOf(declaration.editor, findings, form.values())), combineFeedback)
                            : feedback
                    }, {})
                    return withInputFeedback(form, {
                        feedbackOf: name => _.mergeWith({}, name === sourceInput ? sourceFeedback : null, outputFeedback[name], combineFeedback),
                        blocked: () => Boolean(sourceCandidate?.refused() || outputEditors.some(({declaration, candidate}) =>
                            declaration.editor.blocksApply !== false && candidate?.refused()
                        ))
                    })
                }
            },
            withForm({fields, constraints}),
            initValues(valuesSpec),
            withRecipe(createMapRecipeToProps(mapRecipeToProps)),
            withActivatable({id, policy: policyToApply}),
            withRecipe(createMapRecipeToProps(mapRecipeToProps)),
            withPanelWizard(),
            withSourceRuntime()
        )
    }
}

export const RecipeFormPanel = ({className, placement, isActionForm, additionalUpdates, accepts, onApply, onCancel, onClose, children}) =>
    <Context.Consumer>
        {({id, evaluatedPath, form, sourceCandidate, outputEditors, statePath, valuesToModel, deactivate, prevValues}) => {
            const wrappedOnApply = values => {
                if (isActionForm) {
                    setValues({evaluatedPath, statePath, values})
                    onApply && onApply(values)
                } else if (valuesToModel) {
                    const model = valuesToModel(values)
                    setModelAndValues({
                        evaluatedPath, statePath, model, values,
                        updates: additionalUpdates ? additionalUpdates(values) : []
                    })
                    onApply && onApply(values, model, prevValues)
                }
            }
            return (
                <Form.Panel
                    id={id}
                    className={className}
                    placement={placement}
                    form={form}
                    accepts={values => {
                        // Recheck the submitted draft, including Enter/Next and changes since the last render.
                        sourceCandidate?.update(values)
                        outputEditors.forEach(({candidate}) => candidate?.update(values))
                        return !sourceCandidate?.refused()
                            && !outputEditors.some(({declaration, candidate}) => declaration.editor.blocksApply !== false && candidate?.refused())
                            && (!accepts || accepts(values))
                    }}
                    isActionForm={isActionForm}
                    onApply={values => {
                        wrappedOnApply(values)
                    }}
                    onCancel={() => {
                        onCancel && onCancel()
                    }}
                    onClose={() => {
                        deactivate()
                        onClose && onClose()
                    }}
                >
                    {children}
                </Form.Panel>
            )
        }}
    </Context.Consumer>

RecipeFormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    // Whether the values may be applied as the session now stands: refused, nothing is committed and the panel stays
    // open (widget/form/panel.jsx).
    accepts: PropTypes.func,
    // The rest of the recipe this panel's values imply, as [{path, value, merge}] over recipe-relative
    // paths, published in the same action as the panel's own model.
    additionalUpdates: PropTypes.func,
    className: PropTypes.string,
    isActionForm: PropTypes.any,
    placement: PropTypes.any,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onClose: PropTypes.func
}

// One action, so no subscriber observes this panel's new model beside settings it was applied to replace.
const setModelAndValues = ({evaluatedPath, statePath, model, values, updates = []}) => {
    if (!evaluatedPath)
        return
    return updates
        .reduce(
            (builder, {path, value, merge}) => merge
                ? builder.assign([statePath, path], value)
                : builder.set([statePath, path], value),
            actionBuilder('SET_MODEL_AND_VALUES', {evaluatedPath, model, values})
                .setIfChanged([statePath, 'ui', evaluatedPath], values)
                .setIfChanged([statePath, 'model', evaluatedPath], model)
        )
        .dispatch()
}

const setValues = ({evaluatedPath, statePath, values}) => {
    if (!evaluatedPath)
        return
    actionBuilder('SET_VALUES', {evaluatedPath, values})
        .setIfChanged([statePath, 'ui', evaluatedPath], values)
        .dispatch()
}

const setDirty = ({evaluatedPath, statePath, dirty}) => {
    if (!evaluatedPath)
        return
    actionBuilder('SET_DIRTY', {evaluatedPath, dirty})
        .setIfChanged([statePath, 'ui', evaluatedPath, 'dirty'], dirty)
        .dispatch()
}

// What a candidate's findings tell each input of the panel: all of them to the editor's one input - as the editor says
// them there (`editor.message(findings)`) or as the requirement does - or each to the input the editor names for it.
const outputFeedbackOf = (editor, findings, values) => {
    if (typeof editor.input !== 'function') {
        return {[editor.input]: {
            error: editor.message ? editor.message(findings) : findings.message,
            diagnostics: findings.diagnostics,
            ...(findings.referenceFeedback && {referenceFeedback: findings.referenceFeedback})
        }}
    }
    const byInput = _.groupBy(findings.diagnostics, diagnostic => editor.input(diagnostic, values))
    return _.mapValues(byInput, diagnostics => ({error: editor.describe(diagnostics, values), diagnostics}))
}

// Preserve all explanations when declarations address the same field.
const combineFeedback = (previous, next, key) => {
    if (key === 'error' && previous && next) {
        return [previous, next].join(' ')
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
        return [...previous, ...next]
    }
}
