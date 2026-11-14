ARG PREVIOUS_IMAGE=ghcr.io/usa-reddragon/dmr-web:main

FROM --platform=$BUILDPLATFORM ${PREVIOUS_IMAGE} AS previous

FROM --platform=$BUILDPLATFORM golang:1.27.4-alpine@sha256:0a5f7fe796599ff487605987432e7619ae45beeb2fba4c2ce0b907879932aebf AS wasm

WORKDIR /src/wasm
COPY wasm/go.mod wasm/go.sum ./
RUN go mod download
COPY wasm/ ./
RUN CGO_ENABLED=0 GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o /out/radio.wasm ./cmd/radio \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/wasm_exec.js

FROM --platform=$BUILDPLATFORM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS web

WORKDIR /src
COPY package.json package-lock.json ./
RUN CYPRESS_INSTALL_BINARY=0 npm ci
COPY . .
COPY --from=wasm /out/radio.wasm src/radio/radio.wasm
COPY --from=wasm /out/wasm_exec.js src/radio/wasm_exec.js
RUN npm run build:tsc && npx vite build

FROM --platform=$BUILDPLATFORM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS carry
ARG CARRY_FIRST_BUILD
COPY scripts/carry-assets.sh /carry-assets.sh
COPY --from=web /src/dist /out/html
RUN --mount=type=bind,from=previous,target=/previous \
    sh /carry-assets.sh \
      /previous/usr/share/nginx/carry-builds /out/carry-builds \
      /previous/usr/share/nginx/html/assets /out/html/assets \
 && if [ ! -f /previous/usr/share/nginx/carry-builds ] && [ -f /previous/usr/share/nginx/html/radio.wasm ]; then \
      cp -p /previous/usr/share/nginx/html/radio.wasm /out/html/radio.wasm; \
    fi

FROM nginx:1.31.8-alpine@sha256:fed7e14be83cbd2661a75cdc5b872d936cf155d46c327084d30b8df19ae88d72

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/headers.conf /etc/nginx/headers.conf
COPY --from=carry /out/html /usr/share/nginx/html
COPY --from=carry /out/carry-builds /usr/share/nginx/carry-builds

USER 101:101
EXPOSE 8080
