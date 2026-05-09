// App entry — wires Init → Board with a transition.
const { useState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": true,
  "density": "medium",
  "screen": "init"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // sync theme class on <html>
  React.useEffect(() => {
    document.documentElement.classList.toggle("light", !t.dark);
  }, [t.dark]);

  function go(screen) { setTweak("screen", screen); }

  return (
    <>
      <div className="screen-stage">
        {t.screen === "init" ? (
          <InitScreen onReady={() => go("board")} key="init" />
        ) : (
          <Board density={t.density} key="board" />
        )}
      </div>

      {/* small floating "back to init" pill when on board, for demo navigation */}
      {t.screen === "board" && (
        <button className="proto-jumpback" onClick={() => go("init")} title="回到 init 畫面 (僅 demo)">
          ← Init
        </button>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="畫面">
          <TweakRadio
            label="screen"
            options={["init", "board"]}
            value={t.screen}
            onChange={(v) => setTweak("screen", v)}
          />
        </TweakSection>
        <TweakSection label="主題">
          <TweakToggle
            label="深色模式"
            value={t.dark}
            onChange={(v) => setTweak("dark", v)}
          />
        </TweakSection>
        <TweakSection label="密度">
          <TweakRadio
            label="density"
            options={["compact", "medium"]}
            value={t.density}
            onChange={(v) => setTweak("density", v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
