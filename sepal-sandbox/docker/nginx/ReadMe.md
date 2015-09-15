Prerequisites:
Copy conf/sepal over the server[see /etc/nginx/sites-enabled mounting]

Volumes to be mounted:

/etc/ssl/fao -> certificates
/etc/nginx/sites-enabled -> configuration
/var/log/nginx -> log location

[Docker command]
docker run --restart always --name nginx -p 80:80 -p 443:443 --link gateone:gateone --link sepal-php:sepal-php -d -v /data/nginx/sites-enabled:/etc/nginx/sites-enabled -v /data/ssl/certificates:/etc/ssl/fao -v /data/logs/ngnix:/var/log/nginx openforis/nginx
