import {FormButtons as Buttons} from 'widget/buttons'
import {Field, form} from 'widget/form'
import {PanelButtons} from 'widget/panel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {activatable} from 'widget/activation/activatable'
import {getRevisions, revertToRevision$} from 'app/home/body/process/recipe'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import FormPanel from 'widget/formPanel'
import PropTypes from 'prop-types'
import React from 'react'
import moment from 'moment'
import styles from './revisions.module.css'

const fields = {
    revision: new Field().notBlank('process.revisions.required')
}

class Revisions extends React.Component {
    renderRevisions() {
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
            <Buttons type='vertical-tight' uppercase={false} options={options} input={revision}/>
        )
    }

    render() {
        const {form, inputs: {revision}, activatable: {deactivate}} = this.props
        const confirm = () => this.revertToRevision(revision.value)
        const cancel = () => deactivate()
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                isActionForm
                close={() => deactivate()}
                modal>
                <PanelHeader
                    icon='clock'
                    title={msg('process.revisions.title')}/>
                <PanelContent className={styles.content}>
                    <ScrollableContainer>
                        <Scrollable>
                            {this.renderRevisions()}
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
                <PanelButtons onEnter={confirm} onEscape={cancel}>
                    <PanelButtons.Main>
                        <PanelButtons.Confirm
                            label={msg('process.revisions.revert')}
                            disabled={form.isInvalid()}
                            onClick={confirm}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Cancel onClick={cancel}/>
                    </PanelButtons.Extra>
                </PanelButtons>
            </FormPanel>
        )
    }

    revertToRevision(revision) {
        const {recipeId, stream, deactivate} = this.props
        stream('REVERT_TO_REVISION',
            revertToRevision$(recipeId, revision).pipe(
                map(() => deactivate())
            )
        )
    }
}

Revisions.propTypes = {
    recipeId: PropTypes.string.isRequired
}

const policy = () => ({_: 'allow'})

export default (
    activatable({id: 'revisions', policy})(
        form({fields})(Revisions)
    )
)
