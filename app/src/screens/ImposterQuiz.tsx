import { store, type State } from '../store/useStore';
import type { QuizPhase } from '../store/store';
import { ANSWERS, MARKS, OTHERS, grad } from '../data/people';
import { TINTS } from '../data/progression';
import { ArrowRight, Close, Glyph } from '../components/Primitives';
import { glass, head, jakarta, kicker, outfit, row } from '../components/ui';
import { Loop } from './Entry';

const HUD: Record<QuizPhase, string> = {
  reveal: 'R1 · DEAL',
  q: 'R1 · YOUR CARD',
  answer: 'R1 · ANSWER',
  compare: 'R1 · REVEAL',
  discuss: 'R1 · DISCUSS',
  vote: 'R1 · VOTE',
  out: 'R1 · RESULT',
};

const QUESTION = 'Name a fruit that is green.';
const SUGGESTIONS = ['Apple', 'Guava', 'Lime', 'Grapes'];

const phasePad = '6px 20px 34px';

/** 08 · Imposter Quiz — deal, read, answer, reveal, discuss, vote, result. */
export default function ImposterQuiz({ s }: { s: State }) {
  const myGrad = TINTS[s.tint].grad;
  const myMark = MARKS[s.mark];

  /** Everyone at the table, you last. */
  const readers = [
    ...OTHERS.map((p, i) => ({ mark: p.mark, grad: grad(p.gi), delay: `${i * 160}ms` })),
    { mark: myMark, grad: myGrad, delay: '640ms' },
  ];

  const answerCards = [
    ...ANSWERS.map(([name, text], i) => ({
      name,
      text,
      mark: OTHERS[i].mark,
      grad: grad(OTHERS[i].gi),
      border: 'var(--line)',
      mine: false,
      delay: `${i * 110}ms`,
    })),
    { name: s.myName, text: s.myAnswer || '—', mark: myMark, grad: myGrad, border: 'var(--acc)', mine: true, delay: '440ms' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '60px 0 0', position: 'relative', zIndex: 1, minHeight: 0 }}>
      {/* hud */}
      <div style={{ ...row, gap: 9, padding: '0 20px 12px' }}>
        <div
          style={{
            padding: '6px 12px',
            ...glass(10),
            font: `800 9.5px ${outfit}`,
            letterSpacing: '.12em',
            color: 'var(--accLt)',
            marginRight: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {HUD[s.qp]}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)', boxShadow: '0 0 8px var(--acc)' }} />
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,.14)' }} />
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,.14)' }} />
        </div>
        <button onClick={store.enterLobby} style={{ ...glass(14), appearance: 'none', width: 36, height: 36, cursor: 'pointer', color: 'var(--ink)', display: 'grid', placeItems: 'center' }} aria-label="Leave">
          <Close />
        </button>
      </div>

      {/* ── deal ─────────────────────────────────────────────────── */}
      {s.qp === 'reveal' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: phasePad, minHeight: 0 }}>
          <div style={{ ...row, gap: 7, marginBottom: 12 }}>
            {readers.map((r, i) => (
              <div
                key={i}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: r.grad,
                  display: 'grid',
                  placeItems: 'center',
                  font: `800 11px ${outfit}`,
                  color: '#fff',
                  animation: `vPop .4s both`,
                  animationDelay: r.delay,
                }}
              >
                {r.mark}
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: 'var(--dim2)', marginLeft: 2 }}>5 cards dealt</div>
          </div>

          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {/* the rest of the deck, stacked behind */}
            <div style={{ position: 'absolute', inset: '20px 12px auto 12px', height: '70%', ...glass(24), transform: 'rotate(-4deg)' }} />
            <div style={{ position: 'absolute', inset: '10px 6px auto 6px', height: '74%', borderRadius: 24, background: 'var(--panel2)', transform: 'rotate(3deg)' }} />

            <button
              onClick={() => store.setQp('q')}
              style={{
                appearance: 'none',
                position: 'relative',
                width: '100%',
                height: '100%',
                border: '1px solid rgba(150,180,255,.5)',
                borderRadius: 26,
                background: 'linear-gradient(160deg,rgba(168,186,255,.3),rgba(120,140,240,.1) 55%,rgba(244,144,192,.08))',
                boxShadow: '0 0 34px rgba(150,180,255,.3)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 24,
                textAlign: 'left',
                color: '#fff',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: 'radial-gradient(rgba(255,255,255,.16) 1.3px,transparent 1.4px)',
                  backgroundSize: '22px 22px',
                  opacity: 0.5,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 70,
                  background: 'linear-gradient(90deg,transparent,rgba(150,180,255,.35),transparent)',
                  animation: 'vShine 3.6s ease-in-out infinite',
                }}
              />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-56%)', display: 'grid', placeItems: 'center' }}>
                <Loop size={140} stroke="rgba(150,180,255,.45)" width={1} />
                <div style={{ position: 'absolute', font: `800 66px ${outfit}`, color: '#fff', textShadow: '0 0 24px rgba(150,180,255,.9)' }}>?</div>
              </div>

              <div style={{ ...row, gap: 8, position: 'relative' }}>
                <div
                  style={{
                    padding: '5px 11px',
                    borderRadius: 8,
                    background: 'rgba(150,180,255,.28)',
                    border: '1px solid rgba(150,180,255,.5)',
                    font: `800 9px ${outfit}`,
                    letterSpacing: '.1em',
                    color: 'var(--accLt)',
                  }}
                >
                  GENERAL PACK
                </div>
                <div
                  style={{
                    padding: '5px 11px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,.4)',
                    border: '1px solid rgba(255,255,255,.12)',
                    font: `800 9px ${outfit}`,
                    color: '#fff',
                  }}
                >
                  {s.opt.odd} ODD ONE
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{ font: `800 27px/1.05 ${outfit}`, letterSpacing: '-.02em' }}>
                  Tap to read
                  <br />
                  your card
                </div>
                <div style={{ ...row, gap: 7, fontSize: 12, opacity: 0.75, marginTop: 9 }}>
                  <Glyph
                    d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M6.1 6.3C4 7.7 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.2-1M9.9 6.2A8.7 8.7 0 0112 6c6.5 0 10 6 10 6s-.9 1.5-2.5 3"
                    size={14}
                    width={2.2}
                  />
                  Don't let them see the screen
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── your card ────────────────────────────────────────────── */}
      {s.qp === 'q' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: phasePad, minHeight: 0, animation: 'vFlip .36s' }}>
          <div
            style={{
              flex: 1,
              borderRadius: 26,
              padding: 24,
              background: 'var(--panel)',
              border: '1px solid rgba(150,180,255,.4)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              boxShadow: '0 0 28px rgba(150,180,255,.16)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 'auto -30px -60px auto',
                width: 190,
                height: 190,
                borderRadius: '50%',
                background: 'radial-gradient(circle,rgba(150,180,255,.4),transparent 70%)',
              }}
            />
            <div style={{ ...row, gap: 8, position: 'relative' }}>
              <div style={{ padding: '5px 11px', borderRadius: 8, background: 'rgba(150,180,255,.2)', font: `800 9px ${outfit}`, letterSpacing: '.12em', color: 'var(--accLt)' }}>
                YOUR QUESTION
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--dim2)' }}>Round 1 of 3</div>
            </div>
            <div style={{ font: `800 70px/.7 ${outfit}`, color: 'rgba(150,180,255,.25)', margin: '14px 0 -12px', position: 'relative' }}>“</div>
            <div style={{ font: `800 31px/1.14 ${outfit}`, letterSpacing: '-.025em', position: 'relative' }}>{QUESTION}</div>

            <div
              style={{
                ...row,
                gap: 9,
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 15,
                background: 'rgba(150,180,255,.1)',
                border: '1px solid rgba(150,180,255,.3)',
                position: 'relative',
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--pink)" strokeWidth={2.2} style={{ flex: 'none' }} aria-hidden>
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                <circle cx="12" cy="12" r="2.4" />
              </svg>
              <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                One of you got a <b>different</b> question. It might be you.
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 14 }} />

            <div style={{ position: 'relative' }}>
              <div style={{ font: `800 9px ${outfit}`, letterSpacing: '.14em', color: 'var(--dim2)', marginBottom: 9 }}>READING NOW</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {readers.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: r.grad,
                      display: 'grid',
                      placeItems: 'center',
                      font: `800 13px ${outfit}`,
                      color: '#fff',
                      animation: 'vDots 1.6s ease-in-out infinite',
                      animationDelay: r.delay,
                    }}
                  >
                    {r.mark}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => store.setQp('answer')}
            style={{
              appearance: 'none',
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '17px 20px',
              borderRadius: 999,
              border: 0,
              background: 'var(--gradv)',
              boxShadow: 'var(--glow)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              cursor: 'pointer',
              font: `700 15.5px ${outfit}`,
              color: '#fff',
            }}
          >
            Got it — let me answer
            <ArrowRight />
          </button>
        </div>
      )}

      {/* ── answer ───────────────────────────────────────────────── */}
      {s.qp === 'answer' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: phasePad, minHeight: 0, animation: 'vUp .25s' }}>
          <div style={{ ...row, gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginRight: 'auto' }}>{QUESTION}</div>
            <div
              style={{
                padding: '5px 11px',
                borderRadius: 10,
                background: 'rgba(150,180,255,.14)',
                border: '1px solid rgba(150,180,255,.35)',
                color: 'var(--pink)',
                font: `800 11.5px ${outfit}`,
                animation: 'vPulse 1.6s infinite',
              }}
            >
              0:22
            </div>
          </div>

          <div style={{ borderRadius: 20, background: 'var(--panel)', border: '1px solid rgba(150,180,255,.4)', backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)', boxShadow: 'var(--spec)', padding: 18 }}>
            <div style={{ font: `800 9px ${outfit}`, letterSpacing: '.14em', color: 'var(--dim2)', marginBottom: 8 }}>YOUR ANSWER</div>
            <input
              value={s.myAnswer}
              onChange={(e) => store.setAnswer(e.target.value)}
              aria-label="Your answer"
              style={{ width: '100%', appearance: 'none', background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', font: `800 28px ${outfit}` }}
            />
            <div style={{ height: 2, background: 'var(--gradv)', borderRadius: 999, marginTop: 10, boxShadow: '0 0 10px rgba(150,180,255,.8)' }} />
          </div>

          <div style={{ font: `800 9px ${outfit}`, letterSpacing: '.14em', color: 'var(--dim2)', margin: '18px 0 9px' }}>QUICK PICKS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((t) => (
              <button key={t} onClick={() => store.setAnswer(t)} className="hov-acc" style={{ appearance: 'none', padding: '10px 15px', ...glass(13), color: 'var(--ink)', cursor: 'pointer', font: `600 12.5px ${jakarta}` }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
            {OTHERS.map((p) => (
              <div
                key={p.name}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: grad(p.gi),
                  border: '2px solid transparent',
                  display: 'grid',
                  placeItems: 'center',
                  font: `800 12px ${outfit}`,
                  color: '#fff',
                  animation: 'vPop .4s both',
                }}
              >
                {p.mark}
              </div>
            ))}
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'transparent',
                border: '2px solid var(--line2)',
                display: 'grid',
                placeItems: 'center',
                font: `800 12px ${outfit}`,
                color: 'var(--dim2)',
              }}
            >
              {myMark}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim2)', marginLeft: 4 }}>4 of 5 in</div>
          </div>

          <div style={{ flex: 1, minHeight: 14 }} />

          <div style={{ ...row, gap: 9, padding: '12px 14px', borderRadius: 15, background: 'rgba(150,180,255,.1)', border: '1px solid rgba(150,180,255,.3)', marginBottom: 10 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accLt)" strokeWidth={2.2} style={{ flex: 'none' }} aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>Answers stay hidden until everyone locks in.</div>
          </div>

          <button
            onClick={() => store.setQp('compare')}
            style={{
              appearance: 'none',
              padding: '17px 20px',
              borderRadius: 999,
              border: 0,
              background: 'var(--gradv)',
              boxShadow: 'var(--glow)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              cursor: 'pointer',
              font: `700 15.5px ${outfit}`,
              color: '#fff',
            }}
          >
            Lock it in
          </button>
        </div>
      )}

      {/* ── reveal ───────────────────────────────────────────────── */}
      {s.qp === 'compare' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: phasePad, minHeight: 0 }}>
          <div style={{ font: `800 22px ${outfit}`, letterSpacing: '-.01em' }}>All five at once</div>
          <div style={{ fontSize: 12.5, color: 'var(--dim)', margin: '6px 0 14px' }}>Nobody could copy.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {answerCards.map((a, i) => (
              <div
                key={i}
                style={{
                  ...row,
                  gap: 11,
                  padding: '11px 13px',
                  borderRadius: 18,
                  background: 'var(--panel)',
                  border: `1px solid ${a.border}`,
                  backdropFilter: 'var(--blur)',
                  WebkitBackdropFilter: 'var(--blur)',
                  boxShadow: 'var(--spec)',
                  animation: 'vSlide .42s both',
                  animationDelay: a.delay,
                }}
              >
                <div style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: a.grad, display: 'grid', placeItems: 'center', font: `800 14px ${outfit}`, color: '#fff' }}>
                  {a.mark}
                </div>
                <div style={{ marginRight: 'auto' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--dim2)' }}>{a.name}</div>
                  <div style={head(17)}>{a.text}</div>
                </div>
                {a.mine && (
                  <div style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(150,180,255,.24)', color: 'var(--accLt)', font: `800 9.5px ${outfit}` }}>YOURS</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 14 }} />
          <button
            onClick={() => store.setQp('discuss')}
            style={{ appearance: 'none', padding: '17px 20px', borderRadius: 999, border: 0, background: 'var(--gradv)', boxShadow: 'var(--glow)', cursor: 'pointer', font: `700 15.5px ${outfit}`, color: '#fff' }}
          >
            Start discussion
          </button>
        </div>
      )}

      {/* ── discussion ───────────────────────────────────────────── */}
      {s.qp === 'discuss' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: phasePad, minHeight: 0 }}>
          <div style={{ ...kicker('var(--dim2)'), alignSelf: 'flex-start' }}>TALK IT OUT</div>
          <div style={{ position: 'relative', width: 200, height: 200, margin: '14px 0 6px', display: 'grid', placeItems: 'center' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `conic-gradient(var(--acc) ${Math.round(100 * (1 - s.secs / Math.max(1, s.opt.discuss)))}%, var(--track) 0)`,
              }}
            />
            <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', background: 'var(--bg)' }} />
            <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', boxShadow: 'inset 0 0 26px rgba(150,180,255,.35)' }} />
            <div style={{ font: `800 56px ${outfit}`, letterSpacing: '-.03em', position: 'relative' }}>
              0:{String(s.secs).padStart(2, '0')}
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {answerCards.map((a, i) => (
              <div key={i} style={{ ...row, gap: 10, padding: '9px 12px', ...glass(15) }}>
                <div style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: a.grad, display: 'grid', placeItems: 'center', font: `800 11px ${outfit}`, color: '#fff' }}>
                  {a.mark}
                </div>
                <div style={{ fontSize: 12, color: 'var(--dim)', marginRight: 'auto' }}>{a.name}</div>
                <div style={head(13.5)}>{a.text}</div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 12 }} />
          <button
            onClick={() => store.setQp('vote')}
            style={{ appearance: 'none', width: '100%', padding: 16, borderRadius: 18, ...glass(18), border: '1px solid var(--line2)', cursor: 'pointer', font: `700 14.5px ${outfit}`, color: 'var(--ink)' }}
          >
            Skip to vote
          </button>
        </div>
      )}

      {/* ── vote ─────────────────────────────────────────────────── */}
      {s.qp === 'vote' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: phasePad, minHeight: 0, animation: 'vUp .25s' }}>
          <div style={{ ...kicker('var(--pink)') }}>VOTE</div>
          <div style={{ font: `800 25px/1.1 ${outfit}`, letterSpacing: '-.02em', margin: '8px 0 16px' }}>
            Who had the
            <br />
            different question?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {OTHERS.map((p) => {
              const on = s.vote === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => store.castVote(p.name)}
                  style={{
                    appearance: 'none',
                    borderRadius: 20,
                    padding: 15,
                    cursor: 'pointer',
                    background: on ? 'rgba(150,180,255,.16)' : 'var(--panel)',
                    border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 11,
                    alignItems: 'flex-start',
                    color: 'var(--ink)',
                  }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: grad(p.gi), display: 'grid', placeItems: 'center', font: `800 18px ${outfit}`, color: '#fff' }}>
                    {p.mark}
                  </div>
                  <div style={head(14)}>{p.name}</div>
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, minHeight: 14 }} />
          {s.vote ? (
            <div style={{ padding: 15, borderRadius: 18, background: 'rgba(150,180,255,.16)', border: '1px solid var(--acc)', animation: 'vPop .25s' }}>
              <div style={head(14)}>You voted {s.vote}</div>
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 3 }}>Waiting on the others…</div>
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--dim2)' }}>One tap. No takebacks.</div>
          )}
        </div>
      )}

      {/* ── result ───────────────────────────────────────────────── */}
      {s.qp === 'out' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: phasePad, minHeight: 0, animation: 'vUp .3s' }}>
          <div
            style={{
              borderRadius: 24,
              padding: 24,
              background: 'linear-gradient(150deg,var(--g2),var(--acc) 55%,var(--g2))',
              boxShadow: '0 0 30px rgba(150,180,255,.45)',
              color: '#fff',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 'auto -20px -50px auto', width: 170, height: 170, borderRadius: '50%', background: 'rgba(255,255,255,.12)' }} />
            <div style={{ width: 54, height: 54, borderRadius: 20, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', font: `800 22px ${outfit}`, marginBottom: 14 }}>
              ◐
            </div>
            <div style={{ font: `800 32px/1 ${outfit}`, letterSpacing: '-.02em' }}>
              Karthik
              <br />
              voted out
            </div>
            <div style={{ fontSize: 13, opacity: 0.92, marginTop: 11 }}>He said tomato. He was a civilian.</div>
          </div>

          <div style={{ display: 'flex', gap: 11, marginTop: 14, padding: 15, ...glass(18) }}>
            <div style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: myGrad, display: 'grid', placeItems: 'center', font: `800 13px ${outfit}`, color: '#fff' }}>
              {myMark}
            </div>
            <div>
              <div style={head(14.5)}>You were the odd one out</div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 3 }}>Your question asked for green. Apple covered you.</div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 16 }} />
          <button
            onClick={store.finishQuiz}
            style={{
              appearance: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '17px 20px',
              borderRadius: 999,
              border: 0,
              background: 'var(--gradv)',
              boxShadow: 'var(--glow)',
              cursor: 'pointer',
              font: `700 15.5px ${outfit}`,
              color: '#fff',
            }}
          >
            Scoreboard
            <ArrowRight />
          </button>
        </div>
      )}
    </div>
  );
}
