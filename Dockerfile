FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS wasm

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
COPY --from=wasm /out/radio.wasm public/radio.wasm
COPY --from=wasm /out/wasm_exec.js src/radio/wasm_exec.js
RUN npm run build:tsc && npx vite build

FROM nginx:1.31.8-alpine@sha256:1ef7ca94d7879df82421428ce13bd1eaa412404953859cf7a5b6512c25e67a60

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/headers.conf /etc/nginx/headers.conf
COPY --from=web /src/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080
