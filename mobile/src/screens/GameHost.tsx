import { useMemo } from 'react';
import { View } from 'react-native';
import { store, useStore } from '../store/useStore';
import { buildSeats } from '../lib/seats';
import { TINTS } from '../data/progression';
import { MARKS } from '../data/people';
import { findGame } from '../game/registry';
import type { MatchConfig, Player } from '../game/contract';
import { useTheme } from '../theme/theme';
import { H, P } from '../components/base';

/**
 * Hosts whichever registry game the lobby started.
 *
 * The lobby's agreed settings are translated into a MatchConfig here, so games
 * never reach into the app store — they receive everything they need and hand
 * back a finished scoreboard.
 */
export default function GameHost() {
  const s = useStore();
  const t = useTheme();
  const entry = findGame(s.game);

  const config = useMemo<MatchConfig>(() => {
    const { seats } = buildSeats(s);
    const you: Player = {
      name: s.myName,
      mark: MARKS[s.mark],
      grad: TINTS[s.tint].grad,
      bot: false,
    };
    const opponents: Player[] = seats
      .slice(1)
      .filter((seat) => seat.kind !== 'invite')
      .map((seat) => ({ name: seat.name, mark: seat.mark, grad: seat.grad, bot: seat.kind === 'bot' }));

    return { game: s.game, cat: s.cat, you, opponents, difficulty: s.diff, options: s.opt };
    // The match is fixed at the moment it starts — later lobby edits must not
    // reshuffle a game already in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.game]);

  if (!entry) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
        <H size={18}>{s.game}</H>
        <P size={13} color={t.dim} style={{ textAlign: 'center' }}>
          This title has no playable module yet.
        </P>
      </View>
    );
  }

  const { Screen } = entry;

  return (
    <Screen
      config={config}
      onFinish={store.finishMatch}
      onExit={store.enterLobby}
      onRules={store.openRules}
      onChat={store.openChat}
      chatCount={s.chat.length}
      onToast={store.flash}
    />
  );
}
