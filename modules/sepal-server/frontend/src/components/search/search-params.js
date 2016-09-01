/**
 * @author Mino Togna
 */

this.countryIso = null
this.polygon    = null
this.targetDate = null

this.init = function () {
    this.countryIso = null
    this.polygon    = null
    this.targetDate = null
}

this.hasValidAoi = function () {
    return !( $.isEmptyString( this.countryIso ) && $.isEmptyString( this.polygon ) )
}

this.addAoiRequestParameter = function ( data ) {
    if ( data ) {
        
        if ( $.isNotEmptyString( this.polygon ) ) {
            data.polygon = this.polygon
        } else if ( $.isNotEmptyString( this.countryIso ) ) {
            data.countryIso = this.countryIso
        }
        
    }
}

module.exports = this
