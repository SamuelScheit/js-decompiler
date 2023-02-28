../node_modules/.bin/webpack -c webpack.config.js
mv main.js webpack.js
../node_modules/.bin/prettier -w webpack.js
