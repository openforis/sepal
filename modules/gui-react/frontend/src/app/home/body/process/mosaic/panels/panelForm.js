import PropTypes from 'prop-types'
import React from 'react'
import PanelButtons from './panelButtons'
import PanelContent from './panelContent'
import styles from './panelForm.module.css'

const PanelForm = ({recipeId, form, onApply, onCancel, icon, onBack, title, modalOnDirty = true, additionalButtons, className, children}) => {
    return (
        <PanelContent
            icon={icon}
            onBack={onBack}
            title={title}
            className={className}>
            {children}
            <div className={styles.footer}>
                <PanelButtons
                    recipeId={recipeId}
                    form={form}
                    additionalButtons={additionalButtons}
                    onApply={onApply}
                    onCancel={onCancel}
                    modalOnDirty={modalOnDirty}
                />
            </div>
        </PanelContent>
    )
}

PanelForm.propTypes = {
    recipeId: PropTypes.string,
    form: PropTypes.object,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    icon: PropTypes.string,
    onBack: PropTypes.func,
    title: PropTypes.string.isRequired,
    modalOnDirty: PropTypes.any,
    additionalButtons: PropTypes.array,
    className: PropTypes.string,
    children: PropTypes.any.isRequired
}

export default PanelForm