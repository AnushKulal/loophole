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
import { TABBED } from './src/store/store';
import { ThemeProvider, useTheme } from './src/theme/theme';
import { Background } from './src/components/Background';
import { ChatSheet, OfflineBanner, RulesSheet, TabBar, Toast } from './src/components/AppChrome';

import Splash from './src/screens/Splash';
import SignIn from './src/screens/SignIn';
import Onboarding from './src/screens/Onboarding';
import Home from './src/screens/Home';
import AllGames from './src/screens/AllGames';
import GameSetup from './src/screens/GameSetup';
import Lobby from './src/screens/Lobby';
import ImposterQuiz from './src/screens/ImposterQuiz';
import GameHost from './src/screens/GameHost';
import Results from './src/screens/Results';
import Profile from './src/screens/Profile';
import PlayerCard from './src/screens/PlayerCard';
import Leaderboard from './src/screens/Leaderboard';
import Friends from './src/screens/Friends';
import AddFriends from './src/screens/AddFriends';
import MessageThread from './src/screens/MessageThread';
import Settings from './src/screens/Settings';
import Inbox from './src/screens/Inbox';
import SeasonPass from './src/screens/SeasonPass';
import TintShop from './src/screens/TintShop';
import Spectate from './src/screens/Spectate';
import Bracket from './src/screens/Bracket';

/** Everything inside the themed frame: the light pools, the screen, the chrome. */
function Shell() {
  const s = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const screen = () => {
    switch (s.scr) {
      case 'splash':
        return <Splash s={s} />;
      case 'login':
        return <SignIn s={s} />;
      case 'onboard':
        return <Onboarding s={s} />;
      case 'home':
        return <Home s={s} />;
      case 'all':
        return <AllGames s={s} />;
      case 'config':
        return <GameSetup s={s} />;
      case 'lobby':
        return <Lobby s={s} />;
      case 'quiz':
        return <ImposterQuiz s={s} />;
      case 'game':
        return <GameHost />;
      case 'results':
        return <Results s={s} />;
      case 'profile':
        return <Profile s={s} />;
      case 'player':
        return <PlayerCard s={s} />;
      case 'board':
        return <Leaderboard s={s} />;
      case 'friends':
        return <Friends s={s} />;
      case 'add':
        return <AddFriends s={s} />;
      case 'dm':
        return <MessageThread s={s} />;
      case 'settings':
        return <Settings s={s} />;
      case 'inbox':
        return <Inbox s={s} />;
      case 'season':
        return <SeasonPass s={s} />;
      case 'shop':
        return <TintShop s={s} />;
      case 'spectate':
        return <Spectate />;
      case 'bracket':
        return <Bracket s={s} />;
      default:
        return <Home s={s} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Background />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {screen()}
        {TABBED.includes(s.scr) && <TabBar scr={s.scr} />}
      </View>

      {s.chatOpen && <ChatSheet s={s} />}
      {s.rulesFor && <RulesSheet game={s.rulesFor} />}
      {s.offline && <OfflineBanner />}
      {s.toast && <Toast text={s.toast} />}
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
    // Adopt a stored session before anything renders past the splash, so a
    // signed-in user never sees the sign-in screen flash by.
    void store.restoreSession();
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
