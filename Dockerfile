FROM node:20-alpine AS build

WORKDIR /workspace

COPY printhub-sdk ./printhub-sdk
COPY LabelGallery ./LabelGallery

WORKDIR /workspace/printhub-sdk
RUN npm install
RUN npm run build

WORKDIR /workspace/LabelGallery
RUN npm install
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY --from=build /workspace/LabelGallery/dist /usr/share/nginx/html
COPY --from=build /workspace/LabelGallery/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/LabelGallery/docker-entrypoint.d/99-labelgallery-config.sh /docker-entrypoint.d/99-labelgallery-config.sh

RUN sed -i 's/\r$//' /docker-entrypoint.d/99-labelgallery-config.sh \
    && chmod +x /docker-entrypoint.d/99-labelgallery-config.sh
