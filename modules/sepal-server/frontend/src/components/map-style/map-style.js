require( './map.scss' )

var stlye = [
    {
        "stylers": [ { "visibility": "simplified" } ]
    }
    , {
        "stylers": [ { "color": "#131314" } ]
    }
    , {
        "featureType": "water",
        "stylers"    : [ { "color": "#131313" }, { "lightness": 4 }
        ]
    }
    , {
        "elementType": "labels.text.fill"
        , "stylers"  : [ { "visibility": "off" }, { "lightness": 25 } ]
    }
]

module.exports = stlye