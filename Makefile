GOFMT_FILES?=$$(find wasm -name '*.go')

fmt:
	gofmt -w $(GOFMT_FILES)

install-deps:
	@echo "--> Installing JavaScript dependencies"
	npm ci
	@echo "--> Done"

build: install-deps
	@echo "--> Building"
	npm run build
	@echo "--> Done"

lint:
	@echo "--> Linting"
	@cd wasm && golangci-lint run
	@cd wasm && GOOS=js GOARCH=wasm golangci-lint run
	@npm run lint
	@npx vue-tsc -b
	@echo "--> Done"

test:
	@echo "--> Running tests"
	@cd wasm && CGO_ENABLED=0 go test -v ./...
	@npm run test:wasm
	@npm run test:unit
	@echo "--> Done"

.PHONY: fmt install-deps build lint test
