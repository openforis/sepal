let overlayMapManager = {
    'config': {
        'geeGatewayApiUrl': '',
        'digitalGlobeApiKey': '',
        'dgcsConnectId': '',
        'planetApiKey': '',
        'sepalHost': ''
    },
    'overlayMapTypes': {},
    'addOverlayMapType': function(overlay, index) {
        if (this.overlayMapTypes[index] !== undefined) {
            return $.Deferred().resolve().promise();
        }
        var that = this;
        var layerName = overlay.layerName;
        if (overlay.type == 'gee-gateway') {
            var collectionName = overlay.collectionName;
            var bands = '';
            var b1 = overlay.band1;
            var b2 = overlay.band2;
            var b3 = overlay.band3;
            if (b1 != '' && b2 != '' && b3 != '') {
                bands = b1 + ',' + b2 + ',' + b3;
            }
            var visParams = {
                min: overlay.min,
                max: overlay.max,
                bands: bands
            };
            var gamma = overlay.gamma;
            if (gamma != '') visParams['gamma'] = gamma;
            var palette = overlay.palette;
            if (palette != '') visParams['palette'] = palette;
            var dateFrom = overlay.dateFrom;
            var dateTo = overlay.dateTo;
            var url = this.config.geeGatewayApiUrl;
            if (collectionName == 'ASTER/AST_L1T_003') {
                url += '/asterMosaic';
            } else if (collectionName == 'NDVI_CHANGE') {
                url += '/ndviChange';
            } else {
                url += '/imageByMosaicCollection';
            }
            return $.ajax({
                url: url,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    collectionName: collectionName,
                    visParams, visParams,
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                    yearFrom: dateFrom,
                    yearTo: dateTo
                })
            }).done(function(data, textStatus, jqXHR) {
                if (data.errMsg) {
                    console.error(data, textStatus, jqXHR);
                } else {
                    if (data.hasOwnProperty('mapid')) {
                        var mapId = data.mapid;
                        var token = data.token;
                        var layerOptions = {
                            getTileUrl: function(tile, zoom) {
                              var baseUrl = 'https://earthengine.googleapis.com/map';
                              var url = [baseUrl, mapId, zoom, tile.x, tile.y].join('/');
                              url += '?token=' + token;
                              return url;
                            },
                            name: layerName,
                            tileSize: new google.maps.Size(256, 256)
                        };
                        var imageMapType = new google.maps.ImageMapType(layerOptions);
                        that.overlayMapTypes[index] = imageMapType;
                    }
                }
            });
        } else if (overlay.type == 'geea-gateway') {
            var imageName = overlay.geeaImageName;
            var visParams = {
                min: overlay.geeaMin,
                max: overlay.geeaMax,
                bands: overlay.geeaBands
            };
            var gamma = overlay.geeaGamma;
            if (gamma != '') visParams['gamma'] = gamma;
            var palette = overlay.geeaPalette;
            if (palette != '') visParams['palette'] = palette;
            return $.ajax({
                url: this.config.geeGatewayApiUrl + '/image',
                type: 'POST',
                contentType: 'application/json',
                async: false,
                data: JSON.stringify({
                    imageName: imageName,
                    visParams, visParams
                })
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error(jqXHR, textStatus, errorThrown);
            }).done(function(data, textStatus, jqXHR) {
                if (data.errMsg) {
                    console.error(data, textStatus, jqXHR);
                } else {
                    if (data.hasOwnProperty('mapid')) {
                        var mapId = data.mapid;
                        var token = data.token;
                        var layerOptions = {
                            getTileUrl: function(tile, zoom) {
                              var baseUrl = 'https://earthengine.googleapis.com/map';
                              var url = [baseUrl, mapId, zoom, tile.x, tile.y].join('/');
                              url += '?token=' + token;
                              return url;
                            },
                            name: layerName,
                            tileSize: new google.maps.Size(256, 256)
                        };
                        var imageMapType = new google.maps.ImageMapType(layerOptions);
                        that.overlayMapTypes[index] = imageMapType;
                    }
                }
            });
        } else if (overlay.type == 'digitalglobe') {
            var mapId = overlay.mapID;
            var token = this.config.digitalGlobeApiKey;
            var layerOptions = {
                getTileUrl: function (tile, zoom) {
                    var url = 'https://{s}.tiles.mapbox.com/v4/{m}/{z}/{x}/{y}.png?access_token=' + token;
                    return url.replace('{s}', 'api').replace('{m}', mapId).replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
                },
                name: layerName,
                tileSize : new google.maps.Size(256, 256)
            }
            var imageMapType = new google.maps.ImageMapType(layerOptions);
            this.overlayMapTypes[index] = imageMapType;
        } else if (overlay.type == 'gibs') {
            var imageryLayer = overlay.imageryLayer;
            var date = overlay.date;
            var layerOptions = {
                alt: layerName,
                getTileUrl: function(tile, zoom) {
                    var url = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{imageryLayer}/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
                    return url.replace('{imageryLayer}', imageryLayer).replace('{date}', date).replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
                },
                maxZoom: 8,
                minZoom: 1,
                name: layerName,
                tileSize: new google.maps.Size(256, 256)
            };
            var imageMapType = new google.maps.ImageMapType(layerOptions);
            this.overlayMapTypes[index] = imageMapType;
        } else if (overlay.type == 'geonetwork') {
            var geonetworkLayer = L.tileLayer.wms('http://data.fao.org/maps/wms?', {
                layers: overlay.geonetworkLayer,
                tiled: true,
                format: 'image/png',
                transparent: true,
                maxZoom: 20,
                minZoom: 0,
                continuousWorld: true,
                version: '1.3.0'
            });
            this.overlayMapTypes[index] = geonetworkLayer;
        } else if (overlay.type == 'dgcs') {
            var connectid = this.config.dgcsConnectId;
            var url = 'https://services.digitalglobe.com/mapservice/wmsaccess?';
            url += 'connectid=' + connectid;
            //
            var stackingProfile = overlay.dgcsStackingProfile;
            if (stackingProfile !== undefined) {
                url += '&featureProfile=' + stackingProfile;
            }
            //
            var filters = '';
            if (overlay.dgcsCloudCover != '') {
                if (filters != '') filters += 'AND';
                filters += "(cloudCover<" + overlay.dgcsCloudCover + ")";
            }
            if (overlay.dgcsAcquisitionDateFrom != '') {
                if (filters != '') filters += 'AND';
                filters += "(acquisitionDate>='" + overlay.dgcsAcquisitionDateFrom + "')";
            }
            if (overlay.dgcsAcquisitionDateTo != '') {
                if (filters != '') filters += 'AND';
                filters += "(acquisitionDate<='" + overlay.dgcsAcquisitionDateTo + "')";
            }
            if (overlay.dgcsProductType != '') {
                if (filters != '') filters += 'AND';
                filters += "(productType='" + overlay.dgcsProductType + "')";
            }
            if (filters != '') url += '&CQL_Filter=' + filters;
            //
            var dgcsLayer = L.tileLayer.wms(url, {
                layers: 'DigitalGlobe:Imagery',
                format: 'image/png',
                style: 'default',
                transparent: true,
                maxZoom: 20,
                minZoom: 0,
                continuousWorld: true,
                crs: L.CRS.EPSG3857,
                version: '1.1.1'
            });
            this.overlayMapTypes[index] = dgcsLayer;
        } else if (overlay.type == 'planet') {
            var mosaic_name = overlay.planetMosaicName;
            var version = overlay.planetApiVersion;
            var api_key = this.config.planetApiKey;
            var layerOptions = {
                getTileUrl: function (tile, zoom) {
                    var url = 'https://tiles.planet.com/basemaps/v1/planet-tiles/{mosaic_name}/gmap/{z}/{x}/{y}.png?api_key=' + api_key;
                    if (version == 'v0') {
                        url = 'https://tiles.planet.com/v0/mosaics/{mosaic_name}/{z}/{x}/{y}.png?api_key=' + api_key;
                    }
                    return url.replace('{mosaic_name}', mosaic_name).replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
                },
                name: layerName,
                tileSize : new google.maps.Size(256, 256)
            }
            var imageMapType = new google.maps.ImageMapType(layerOptions);
            this.overlayMapTypes[index] = imageMapType;
        } else if (overlay.type == 'sepal') {
            return $.ajax({
                url: 'https://' + this.config.sepalHost + '/processing-recipes/' + overlay.sepalMosaicName,
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error(jqXHR, textStatus, errorThrown);
            }).done(function(data, textStatus, jqXHR) {
                var type = data['type'];
                var serviceSubPath = 'mosaic';
                var req = {
                    'imageType': type
                }
                if (type == 'MOSAIC') {
                    var sceneIds = [];
                    for (var key in data['sceneAreas']) {
                        sceneIds = sceneIds.concat(data['sceneAreas'][key]['selection']);
                    };
                    req['targetDayOfYearWeight'] = data['sortWeight'];
                    req['bands'] = overlay.sepalBands; //data['mosaicPreviewBand']
                    req['dataSet'] = data['sensorGroup'];
                    req['sceneIds'] = sceneIds.join();
                    req['targetDayOfYear'] = $.dayOfYear(data['targetDate']);
                    if (data.hasOwnProperty('aoiCode') && data['aoiCode'] != null) {
                        req['countryIso'] = data['aoiCode'];
                    } else if (data.hasOwnProperty('polygon')) {
                        req['polygon'] = data['polygon'];
                    }
                } else if (type == 'CLASSIFICATION') {
                    serviceSubPath = 'classification';
                    req['imageRecipeId'] = data['inputRecipe'];
                    req['assetId'] = data['geeAssetId'];
                    req['tableName'] = data['fusionTableId'];
                    req['classProperty'] = data['fusionTableClassColumn'];
                    req['algorithm'] = data['algorithm'];
                } else if (type == 'CHANGE_DETECTION') {
                    serviceSubPath = 'change-detection';
                    req['fromImageRecipeId'] = data['inputRecipe1'];
                    req['toImageRecipeId'] = data['inputRecipe2'];
                    req['fromAssetId'] = data['geeAssetId1'];
                    req['toAssetId'] = data['geeAssetId2'];
                    req['tableName'] = data['fusionTableId'];
                    req['classProperty'] = data['fusionTableClassColumn'];
                    req['algorithm'] = data['algorithm'];
                }
                $.ajax({
                    url: 'https://' + that.config.sepalHost + '/api/data/' + serviceSubPath + '/preview',
                    type: 'POST',
                    data: $.param(req)
                }).fail(function(jqXHR, textStatus, errorThrown) {
                    console.error(jqXHR, textStatus, errorThrown);
                }).done(function(data, textStatus, jqXHR) {
                    if (data.hasOwnProperty('mapId')) {
                        var mapId = data.mapId;
                        var token = data.token;
                        var layerOptions = {
                            getTileUrl: function(tile, zoom) {
                              var baseUrl = 'https://earthengine.googleapis.com/map';
                              var url = [baseUrl, mapId, zoom, tile.x, tile.y].join('/');
                              url += '?token=' + token;
                              return url;
                            },
                            name: layerName,
                            tileSize: new google.maps.Size(256, 256)
                        };
                        var imageMapType = new google.maps.ImageMapType(layerOptions);
                        that.overlayMapTypes[index] = imageMapType;
                    }
                });
            });
        } else if (overlay.type == 'geoserver') {
            var geoserverLayer = L.tileLayer.wms(overlay.geoserverUrl, {
                layers: overlay.geoserverLayers,
                tiled: true,
                format: overlay.geoserverFormat,
                transparent: true,
                maxZoom: 20,
                minZoom: 0,
                continuousWorld: true,
                version: overlay.geoserverVersion
            });
            this.overlayMapTypes[index] = geoserverLayer;
        }
        return $.Deferred().resolve().promise();

    }

}
