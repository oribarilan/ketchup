ext := "extension"

# Build the extension and reload it in the browser
update:
    cd {{ext}} && npm run build
    node {{ext}}/scripts/reload-extension.mjs

# Reload without rebuilding (e.g. after `npm run dev` picks up changes)
reload:
    node {{ext}}/scripts/reload-extension.mjs

# Start Edge with CDP debugging (one-time — quit Edge first if already open)
edge:
    open -na "Microsoft Edge" --args --remote-debugging-port=9222

# Start Chrome with CDP debugging (one-time — quit Chrome first if already open)
chrome:
    open -na "Google Chrome" --args --remote-debugging-port=9222

# Start Vite dev server with HMR
dev:
    cd {{ext}} && npm run dev

# Run all checks (typecheck + lint + test + build)
check:
    cd {{ext}} && npm run typecheck && npm run lint && npm run test && npm run build

# Run tests
test:
    cd {{ext}} && npm run test

# Run tests in watch mode
test-watch:
    cd {{ext}} && npm run test:watch

# Type-check without emitting
typecheck:
    cd {{ext}} && npm run typecheck

# Lint
lint:
    cd {{ext}} && npm run lint
