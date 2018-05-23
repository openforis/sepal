import PanelButtons from './panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import PanelContent from './panelContent'
import styles from './panelForm.module.css'

const PanelForm = ({recipeId, form, onApply, icon, onBack, title, className, children}) => {
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
                    onApply={onApply}
                />
            </div>
        </PanelContent>
    )
}

PanelForm.propTypes = {
    recipeId: PropTypes.string,
    form: PropTypes.object,
    onApply: PropTypes.func,
    icon: PropTypes.string,
    onBack: PropTypes.func,
    title: PropTypes.string.isRequired,
    className: PropTypes.string,
    children: PropTypes.any.isRequired
}

export default PanelForm