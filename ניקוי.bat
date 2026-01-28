rmdir /s /q node_modules
del pnpm-lock.yaml
pnpm store prune
pnpm install