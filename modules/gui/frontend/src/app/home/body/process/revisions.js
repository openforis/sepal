import {Field, form} from 'widget/form'
import {RecipeState, getRevisions, recipePath, revertToRevision$} from 'app/home/body/process/recipe'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import SelectionList from 'widget/selectionList'
import actionBuilder from 'action-builder'
import moment from 'moment'
import styles from './revisions.module.css'

const fields = {
    revision: new Field()
        .notBlank('process.revisions.required')
}

export const showRevisionsPanel = (recipeId, shown = true) =>
    actionBuilder('SHOW_REVISIONS', {shown})
        .set([recipePath(recipeId), 'ui.showRevisions'], shown)
        .dispatch()

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        open: recipeState('ui.showRevisions')
    }
}

class Revisions extends React.Component {
    renderContent() {
        const {recipeId, inputs: {revision}} = this.props
        const options = getRevisions(recipeId).map(timestamp => {
            const date = moment(+timestamp)
            const label =
                <div className={styles.label}>
                    <div className={styles.date}>{date.format('MMM D YYYY, hh:mm:ss')}</div>
                    <div className={styles.fromNow}>{date.fromNow()}</div>
                </div>
            return {value: timestamp, label}
        })
        return (
            <SelectionList options={options} input={revision}/>
        )
    }

    renderPanel() {
        const {recipeId, form} = this.props
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    form={form}
                    isActionForm={true}
                    statePath={recipePath(recipeId, 'ui')}
                    modal
                    onApply={({revision}) => this.revertToRevision(revision)}
                    onCancel={() => showRevisionsPanel(recipeId, false)}>
                    <PanelHeader
                        icon='clock'
                        title={msg('process.revisions.title')}/>
                    <PanelContent className={styles.content}>
                        {this.renderContent()}
                    </PanelContent>
                    <PanelButtons
                        applyLabel={msg('process.revisions.revert')}/>
                </Panel>
            </Portal>
        )
    }

    render() {
        const {open} = this.props
        return open ? this.renderPanel() : null
    }

    revertToRevision(revision) {
        const {recipeId, asyncActionBuilder} = this.props
        asyncActionBuilder('REVERT_TO_REVISION',
            revertToRevision$(recipeId, revision).pipe(
                map(() => showRevisionsPanel(recipeId, false))
            ))
            .dispatch()
    }
}

Revisions.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default form({fields, mapStateToProps})(Revisions)
