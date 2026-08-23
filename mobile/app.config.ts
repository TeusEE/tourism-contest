import type { ExpoConfig } from 'expo/config';

const naverMapClientId = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID ?? '';
const allowHttpDevServer = process.env.EXPO_PUBLIC_ALLOW_HTTP_DEV_SERVER === 'true';
const isDevelopmentClient =
  process.env.EAS_BUILD_PROFILE !== 'production' && process.env.APP_ENV !== 'production';

const config: ExpoConfig = {
  name: 'Travel Congestion',
  slug: 'travel-congestion',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/icon-ios-v2.png',
  scheme: 'travelcongestion',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.travelcongestion.app',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      ...(allowHttpDevServer
        ? {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: true,
            },
          }
        : {}),
    },
  },
  android: {
    package: 'com.travelcongestion.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    ...(isDevelopmentClient ? ['expo-dev-client'] : []),
    [
      '@mj-studio/react-native-naver-map',
      {
        client_id: naverMapClientId,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          extraMavenRepos: ['https://repository.map.naver.com/archive/maven'],
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080',
    ...(naverMapClientId ? { naverMapClientId } : {}),
    eas: {
      projectId: '259f5442-3692-40ce-a54d-09a66a191f72',
    },
  },
};

export default config;
