import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    target: 'es2022',
    external: ['commander'],
  },
  // CLI build
  {
    entry: ['src/cli.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    clean: false,
    sourcemap: true,
    minify: true,
    target: 'es2022',
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: [],
  }
])