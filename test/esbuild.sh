../node_modules/.bin/esbuild input.ts --bundle --minify --outfile=esbuild.js
../node_modules/.bin/prettier -w esbuild.js
