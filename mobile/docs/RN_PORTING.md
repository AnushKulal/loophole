# Porting a screen from the web build to React Native

The web build in `../app/` is the reference implementation. It is verified and
pixel-correct against the original design, so **port from it** rather than
re-deriving a screen from scratch. Match its layout numbers exactly — the
paddings, gaps, font sizes and radii are all deliberate.

## Where things live

| Web (`app/src/…`) | Native (`mobile/src/…`) |
| --- | --- |
| `styles/tokens.css` | `theme/tokens.ts` + `theme/theme.tsx` |
| `components/ui.ts` helpers | `components/base.tsx` |
| `components/Primitives.tsx` | `components/base.tsx` |
| `components/Chrome.tsx` | `components/Chrome.tsx` |
| `data/`, `game/`, `lib/`, `store/` | identical — already ported, do not duplicate |

Colour comes from `useTheme()`, never from a literal. Type comes from `<H>` /
`<P>` / `<Kicker>`, never a raw `fontFamily`.

## The traps

These are the mistakes that break an RN port. Read them before you write.

**Text must be wrapped.** A bare string inside a `<View>` throws at runtime.
Every piece of text goes inside `<Text>`, or one of `<H>` / `<P>` / `<Kicker>`.

**`letterSpacing` is a number, not an em string.** The design writes
`letter-spacing:.16em` on a 9.5px label. In RN that is `letterSpacing: 1.5`
(0.16 × 9.5). Convert every one — an em string is silently ignored.

**`lineHeight` is pixels, not a ratio.** `line-height:1.4` on 13px text becomes
`lineHeight: 18`. A bare `1.4` collapses the line to nothing.

**Custom fonts ignore `fontWeight`.** Weight is chosen by picking the family
(`Outfit_800ExtraBold` vs `Outfit_600SemiBold`). Setting `fontWeight: '800'` on
a custom family does nothing on Android. Use the `weight` prop on `<H>`/`<P>`.

**Shadows are four properties, not a string.** `shadowColor`, `shadowOffset`,
`shadowRadius`, `shadowOpacity`, plus `elevation` for Android. Put the
`borderRadius` on the *same node* as the shadow or it renders square. Inset
shadows do not exist — the specular rim is already drawn inside `<Glass>`.

**These CSS properties do not exist.** `cursor`, `outline`, `transition`,
`animation`, `filter`, `backdropFilter`, `boxShadow` (as a string),
`whiteSpace`, `textOverflow`, `overflowX` / `overflowY`, `appearance`,
`background` shorthand, `inset`. Use `numberOfLines` instead of
`text-overflow: ellipsis`, and `overflow: 'hidden'` on its own.

**Scrolling is a component.** `overflow: auto` does nothing. Use `<ScrollView>`,
and give horizontal rails `horizontal showsHorizontalScrollIndicator={false}`.

**Events are `onPress`.** Not `onClick`. Use the `<Tap>` wrapper so pressed
state and the accessibility label come for free.

**Inputs are `<TextInput>`.** `value` + `onChangeText` (which receives the
string directly, not an event). `placeholderTextColor` is a separate prop.

**Absolute fill.** `position: 'absolute'` with `top/left/right/bottom: 0`, or
`StyleSheet.absoluteFill`. There is no `position: fixed`.

**Percentage heights need a sized parent.** Prefer `flex: 1` with
`minHeight: 0`, exactly as the web build does.

## Animation

The twelve CSS keyframes become `Animated`:

- `vUp` / `vSlide` — use `<FadeIn>` from `components/Chrome.tsx`
- `vPulse`, `vFloat`, `vDots` — `Animated.loop` with `useNativeDriver: true`
- `vPop` — spring on `scale`
- `vDrop` — `translateY` from off-board to 0
- `vWave` — looping `scale` on the winning pieces

Only `transform` and `opacity` can use the native driver. Anything animating a
colour or a layout value must set `useNativeDriver: false`.

Always stop a loop in the effect's cleanup, or it leaks across screens.

## Verification

Do **not** run `npx tsc` — other agents are writing files at the same time and
you will see their in-progress errors, not yours. Instead, re-read your own file
and check it against this list. Integration typechecks the whole project once
everything has landed.

## Expo API surface

`docs.expo.dev` is unreachable from this environment. The authoritative
reference for the exact installed versions is the bundled type definitions:

```
mobile/node_modules/expo-blur/build/BlurView.types.d.ts
mobile/node_modules/expo-linear-gradient/build/LinearGradient.d.ts
mobile/node_modules/react-native-svg/lib/typescript/index.d.ts
```

Read those rather than recalling an API from memory.
