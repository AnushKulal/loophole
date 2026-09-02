import { useEffect } from 'react';
import { store, useStore } from './store/useStore';
import { ChatSheet, LightPools, OfflineBanner, RulesSheet, TabBar, Toast } from './components/Chrome';
import { TABBED } from './store/store';

import { Onboarding, SignIn, Splash } from './screens/Entry';
import Home from './screens/Home';
import AllGames from './screens/AllGames';
import GameSetup from './screens/GameSetup';
import Lobby from './screens/Lobby';
import ImposterQuiz from './screens/ImposterQuiz';
import Connect4 from './screens/Connect4';
import Uno from './screens/Uno';
import Results from './screens/Results';
import Profile from './screens/Profile';
import PlayerCard from './screens/PlayerCard';
import Leaderboard from './screens/Leaderboard';
import Friends, { AddFriends } from './screens/Friends';
import MessageThread from './screens/MessageThread';
import Settings from './screens/Settings';
import { Bracket, Inbox, SeasonPass, Spectate, TintShop } from './screens/Progression';

export default function App() {
  const s = useStore();

  // Timers outlive individual screens, so they are torn down with the app.
  useEffect(() => () => store.dispose(), []);

  // Keep the browser chrome in step with the in-app theme.
  useEffect(() => {
    document.documentElement.style.colorScheme = s.theme === 'dark' ? 'dark' : 'light';
  }, [s.theme]);

  const screen = () => {
    switch (s.scr) {
      case 'splash':
        return <Splash />;
      case 'login':
        return <SignIn />;
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
      case 'c4':
        return <Connect4 s={s} />;
      case 'uno':
        return <Uno s={s} />;
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
      case 'dm':
        return <MessageThread s={s} />;
      case 'settings':
        return <Settings s={s} />;
      case 'inbox':
        return <Inbox s={s} />;
      case 'add':
        return <AddFriends s={s} />;
      case 'season':
        return <SeasonPass s={s} />;
      case 'shop':
        return <TintShop s={s} />;
      case 'spectate':
        return <Spectate />;
      case 'bracket':
        return <Bracket s={s} />;
    }
  };

  return (
    <div
      data-theme={s.theme}
      style={{
        width: '100%',
        maxWidth: 402,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--ink)',
        position: 'relative',
      }}
    >
      <LightPools />
      {screen()}
      {TABBED.includes(s.scr) && <TabBar scr={s.scr} />}

      {s.chatOpen && <ChatSheet s={s} />}
      {s.rulesFor && <RulesSheet game={s.rulesFor} />}
      {s.offline && <OfflineBanner />}
      {s.toast && <Toast text={s.toast} />}
    </div>
  );
}
