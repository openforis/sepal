/**
 * @author Mino Togna
 */
require( './footer.scss' )
require( './sepal-logo.scss' )

var DashboardLinks = require( './views/dashboard-links-v' )
var SectionUser    = require( './views/section-user' )

var html = null
var Logo = null


var init = function () {
    var template = require( './footer.html' )
    html         = $( template( {} ) )
    
    var footer = $( '.app' ).find( 'footer' )
    if ( footer.children().length <= 0 ) {
        $( '.app' ).append( html )
        
        DashboardLinks.init( html.find( '.dashboard-links' ) )
        SectionUser.init( html.find( '.section-user' ) )
        
        Logo = html.find( ".sepal-logo" )
    }
    
    show()
}

// var hide = function () {
//     html.velocity( { bottom: '-7%' }, { delay: 200, duration: 1200, easing: 'easeOutQuint' } )
// }

var show = function () {
    html.velocity( { bottom: '0' }, { delay: 1000, duration: 1500, easing: 'easeOutQuint' } )
    setTimeout( showLogo, 1000 )
}

var showLogo = function () {
    $.each( Logo.find( 'div' ), function ( i, e ) {
        var elem = $( this )
        elem.velocity( "fadeIn", { display: "inline-block", delay: i * 1000, easing: 'swing' } )
    } )
}

module.exports = {
    init                 : init
    , updateTasks        : DashboardLinks.updateTasks
    , updateNotifications: DashboardLinks.updateNotifications
    , updateUserBudget   : SectionUser.updateUserBudget
}