Prerequisites:
Copy conf/sepal over the server[see /etc/nginx/sites-enabled mounting]

Volumes to be mounted:

/etc/ssl/fao -> certificates
/etc/nginx/sites-enabled -> configuration
/var/log/nginx -> log location

[Docker command]
docker run --name nginx -p 80:80 -p 443:443 -d -v /data/nginx/sites-available:/etc/nginx/sites-available -v /data/ssl/certificates:/etc/ssl/fao -v /data/nginx/log:/var/log/nginx nginx
