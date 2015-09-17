[Action on the guest machine]
useradd -m -u 998 -g sepal geoserver

sudo mkdir /data/geoserver
sudo chown -R geoserver:sepal /data/geoserver

sudo mkdir /date/sdms/geoserver
sudo chmod -R 770 /data/sdms/geoserver
sudo chown -R geoserver:sepal /data/sdms/gepserver
sudo chmod -R +s /data/sdms/geoserver/


sudo mkdir -p /data/logs/geoserver
sudo chown -R geoserver:sepal /data/logs/geoserver

docker run --restart always -d --name geoserver -e "ADMIN_PASSWD=@Fperkele.Geoserver" -v /data/logs/geoserver:/var/log/supervisor -v /data/sdms/geoserver:/data/geoserver openforis/geoserver
