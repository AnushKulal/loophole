import { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useFonts } from 'expo-font';
import {
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { store, useStore } from './src/store/useStore';
import { ThemeProvider, useTheme } from './src/theme/theme';
import { Background } from './src/components/Background';
import Splash from './src/screens/Splash';

/** Everything inside the themed frame: the light pools, then the live screen. */
function Shell() {
  const s = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const screen = () => {
    switch (s.scr) {
      case 'splash':
        return <Splash />;
      default:
        return <Splash />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Background />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>{screen()}</View>
    </View>
  );
}

export default function App() {
  const s = useStore();
  const [loaded] = useFonts({
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    // Keeps the store free of platform imports.
    store.setClipboard((text) => {
      Clipboard.setStringAsync(text).catch(() => {});
    });
    return () => store.dispose();
  }, []);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#0a1018' }} />;

  return (
    <ThemeProvider name={s.theme}>
      <SafeAreaProvider>
        <StatusBar barStyle={s.theme === 'dark' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <Shell />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
