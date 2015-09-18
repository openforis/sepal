Copy certificates
Create /data/apache/sites-enabled
Copy conf file[sites-enabled]
[Docker command]
docker run \
    --restart always \
    --name sepal-php \
    --link geoserver:geoserver \
    --link sepal:sepal \
    --link mysql:mysql \
    -d \
    -v /data/logs/sdms:/var/log/supervisor \
    -v /data/sdms/data:/data/home/ \
    -v /data/sdms/config:/etc/sdms \
    -v /data/apache2/sites-enabled:/etc/apache2/sites-enabled \
    -v /data/ssl/certificates:/etc/apache2/ssl  \
    openforis/sepal-php
