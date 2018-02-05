import React from 'react'
import PropTypes from 'prop-types'

const CenteredPanel = ({className, children}) =>
  <div style={styles.panelContainer}>
    <div className={`panelContainer ${className}`} style={styles.panel}>
      {children}
    </div>
  </div>

CenteredPanel.propTypes = {
  className: PropTypes.string
}

const styles = {
  panelContainer: {
    display: 'grid',
    gridTemplateColumns: 'auto',
    gridTemplateRows: '1fr 1fr 1fr',
    gridTemplateAreas: `
        ".   .   ."
        ". panel ."
        ".   .   ."
      `,
    height: '100%',
  },

  panel: {
    gridArea: 'panel',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '10%',
  }
}

export default CenteredPanel