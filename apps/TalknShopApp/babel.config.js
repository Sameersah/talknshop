module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@/components': './src/components',
            '@/screens': './src/screens',
            '@/services': './src/services',
            '@/store': './src/store',
            '@/hooks': './src/hooks',
            '@/utils': './src/utils',
            '@/constants': './src/constants',
            '@/types': './src/types',
            '@/assets': './src/assets',
          },
        },
      ],
    ],
  };
};
