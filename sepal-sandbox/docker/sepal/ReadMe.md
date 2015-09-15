Mount data etc...
[Give permissions to sepal user to create layer folder]
mkdir 770 sepal/data
lsat_geoserver_fix.sh
docker run --name sepal --link geoserver:geoserver -p 9999:9999 -v /data/sdms/config:/etc/sdms -v /data/sdms/geoserver:/data/geoserver -v /data/sdms/log:/var/log/sepal -v /data/sdms/data:/data/home -d openforis/sepal
