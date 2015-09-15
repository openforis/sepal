Mount data etc...
[Give permissions to sepal user to create layer folder]
mkdir 770 sepal/data

mkdir /data/logs/sepal
sudo chown -R sepal:sepal /data/logs/sepal
lsat_geoserver_fix.sh
docker run --restart always -p 1025:1025 --name sepal --link geoserver:geoserver --link mysql:mysql -v /data/sdms/config:/etc/sdms -v /data/sdms/geoserver:/data/geoserver -v /data/logs/sepal:/var/log/sepal -v /data/sdms/data:/data/home -d openforis/sepal
