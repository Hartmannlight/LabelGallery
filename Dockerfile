FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY config.js /usr/share/nginx/html/config.js
COPY styles.css /usr/share/nginx/html/styles.css
COPY app.js /usr/share/nginx/html/app.js
COPY docker-entrypoint.d/99-labelgallery-config.sh /docker-entrypoint.d/99-labelgallery-config.sh

RUN chmod +x /docker-entrypoint.d/99-labelgallery-config.sh


