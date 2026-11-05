ARG PREVIOUS_IMAGE=ghcr.io/usa-reddragon/dmr-web:main

FROM --platform=$BUILDPLATFORM ${PREVIOUS_IMAGE} AS previous

FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:fa4881266890ef051f0ce63afdfaccb69bbe8186084387f4fafd60d7ecbabc71 AS wasm

WORKDIR /src/wasm
COPY wasm/go.mod wasm/go.sum ./
RUN go mod download
COPY wasm/ ./
RUN CGO_ENABLED=0 GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o /out/radio.wasm ./cmd/radio \
 && cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/wasm_exec.js

FROM --platform=$BUILDPLATFORM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS web

WORKDIR /src
COPY package.json package-lock.json ./
RUN CYPRESS_INSTALL_BINARY=0 npm ci
COPY . .
COPY --from=wasm /out/radio.wasm src/radio/radio.wasm
COPY --from=wasm /out/wasm_exec.js src/radio/wasm_exec.js
RUN npm run build:tsc && npx vite build

FROM --platform=$BUILDPLATFORM alpine:3.24@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS carry
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

FROM nginx:1.31.8-alpine@sha256:a46f57e097e8effc26192437d2e715adf74bcbea836117651ee436c27983fa41

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/headers.conf /etc/nginx/headers.conf
COPY --from=carry /out/html /usr/share/nginx/html
COPY --from=carry /out/carry-builds /usr/share/nginx/carry-builds

USER 101:101
EXPOSE 8080
