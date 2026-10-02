import PropTypes from 'prop-types'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose, composeHoC} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Layout} from '~/widget/layout'
import {Message} from '~/widget/message'

import {IMAGE_OUTPUT} from './recipeOutput'
import {CHECKING_SOURCE, selectedSourceStatusOfState, sourceProblemsOfState} from './selectedSourceStatus'

// What a source section shows about the source selected in it (selectedSourceStatus.js), under the selection the
// recipe holds - matched by type and id, since a selection being edited is not yet that source. Refresh reads the
// source again through the source runtime, which the recipe's evidence lifecycle answers.

const mapStateToProps = (state, {recipeId, section, sourceRuntime}) => ({
    status: selectedSourceStatusOfState(state, recipeId, section, id => sourceRuntime?.evidenceOwnerOf(id))
})

class _SelectedSourceStatus extends React.Component {
    state = {details: false}

    constructor(props) {
        super(props)
        this.refresh = this.refresh.bind(this)
        this.toggleDetails = this.toggleDetails.bind(this)
    }

    render() {
        const {status, type, id} = this.props
        if (!status || status.selected.type !== type || status.selected.id !== id) {
            return null
        }
        return (
            <Layout spacing='compact'>
                <Message
                    type='info'
                    icon={status.state === CHECKING_SOURCE ? 'spinner' : 'triangle-exclamation'}
                    text={status.message}
                />
                {status.details.length ? this.renderDetails(status.details) : null}
                {status.refresh
                    ? <Button icon='rotate' label={msg('process.source.status.refresh')} onClick={this.refresh}/>
                    : null}
            </Layout>
        )
    }

    renderDetails(details) {
        const {details: shown} = this.state
        return (
            <>
                <Button
                    look='transparent'
                    shape='pill'
                    size='small'
                    icon={shown ? 'chevron-up' : 'chevron-down'}
                    label={msg(shown ? 'process.source.status.hideDetails' : 'process.source.status.showDetails', {count: details.length})}
                    onClick={this.toggleDetails}
                />
                {shown
                    ? <ul>{details.map(detail => <li key={detail}>{detail}</li>)}</ul>
                    : null}
            </>
        )
    }

    toggleDetails() {
        this.setState(({details}) => ({details: !details}))
    }

    refresh() {
        const {recipeId, sourceRuntime} = this.props
        sourceRuntime.refreshOutput({recipeId, product: {name: IMAGE_OUTPUT}})
    }
}

export const SelectedSourceStatus = compose(
    _SelectedSourceStatus,
    connect(mapStateToProps),
    withSourceRuntime(),
    withRecipe()
)

SelectedSourceStatus.propTypes = {
    section: PropTypes.string.isRequired,
    id: PropTypes.string,
    type: PropTypes.string
}

// `sourceProblems`: {[sectionId]: message} for the sections whose selected source is unavailable or unsuitable, for a
// toolbar to mark them. Needs the recipe's id, as a recipe-connected component has it.
export const withSourceProblems = () => composeHoC(
    connect((state, {recipeId, sourceRuntime}) => ({
        sourceProblems: sourceProblemsOfState(state, recipeId, id => sourceRuntime?.evidenceOwnerOf(id))
    })),
    withSourceRuntime()
)
