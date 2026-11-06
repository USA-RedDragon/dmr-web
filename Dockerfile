ARG PREVIOUS_IMAGE=ghcr.io/usa-reddragon/dmr-web:main

FROM --platform=$BUILDPLATFORM ${PREVIOUS_IMAGE} AS previous

FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:fa3d596898d9f126af7c01d14ee7597bab3f39cccf392ef36b69fe77cd681f18 AS wasm

WORKDIR /src/wasm
COPY wasm/go.mod wasm/go.sum ./
RUN go mod download
COPY wasm/ ./
RUN CGO_ENABLED=0 GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o /out/radio.wasm ./cmd/radio \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/wasm_exec.js

FROM --platform=$BUILDPLATFORM node:26.13.0-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS web

WORKDIR /src
COPY package.json package-lock.json ./
RUN CYPRESS_INSTALL_BINARY=0 npm ci
COPY . .
COPY --from=wasm /out/radio.wasm src/radio/radio.wasm
COPY --from=wasm /out/wasm_exec.js src/radio/wasm_exec.js
RUN npm run build:tsc && npx vite build

FROM --platform=$BUILDPLATFORM alpine:3.24@sha256:3f4d6b32e26703c6082839234f43769d5046b3ac7c910033911d1e71d8cd630a AS carry
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

FROM nginx:1.31.8-alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/headers.conf /etc/nginx/headers.conf
COPY --from=carry /out/html /usr/share/nginx/html
COPY --from=carry /out/carry-builds /usr/share/nginx/carry-builds

USER 101:101
EXPOSE 8080
