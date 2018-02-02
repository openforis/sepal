import React from 'react'
import PropTypes from 'prop-types'

const CenteredPanel = ({style, className, children}) =>
  <div className={`panelContainer ${className}`} style={styles.panelContainer}>
    <div className="panel" style={Object.assign(styles.panel, style)}>
      {children}
    </div>
  </div>

CenteredPanel.propTypes = {
  style: PropTypes.object,
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