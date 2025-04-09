const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');
const { InjectManifest } = require('workbox-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync({
    ...env,
    pwa: true,
  }, argv);

  // Добавляем плагин для инъекции service worker
  config.plugins.push(
    new InjectManifest({
      swSrc: path.resolve(__dirname, 'web/service-worker.js'),
      swDest: 'service-worker.js',
      exclude: [/\.map$/, /asset-manifest\.json$/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
    })
  );

  // Копируем offline.html
  config.plugins.push(
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'web/offline.html'),
          to: path.resolve(__dirname, 'web-build/offline.html'),
        },
      ],
    })
  );

  return config;
};