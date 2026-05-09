// V3 — 依使用者旅程重新編排:
//   onboarding → 主畫面 → 建立流程 → 細節互動 → 完成 → 環境(通知) → 設定
//
//   1 · 初始化 Init           (第一次開、還沒 .tickets/)
//   2 · 整體看板               (主畫面 · Rail + focus column)
//   3 · Pipeline 創建          (從 Rail ghost 展開)
//   4 · Ticket 創建 Q&A        (Chat + draft 側欄)
//   5 · Ticket drawer 狀態     (step / iter running / iter paused / expanded)
//   6 · Pipeline 完成          (ready to merge)
//   7 · 通知系統               (inbox 集中 + 折疊 strip)
//   8 · Settings               (SKILL tab)

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": true,
  "density": "medium"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const dark = t.dark;

  return (
    <>
      <DesignCanvas>

        {/* ───────── 入口 ───────── */}
        <DCSection
          id="init"
          title="初始化 Init"
          subtitle="第一次打開、repo 還沒 .tickets/ — GUI 全屏卡片"
        >
          <DCArtboard
            id="init-prompt"
            label="Init · this repo isn't set up yet"
            width={1080}
            height={680}
          >
            <InitPrompt dark={dark} />
          </DCArtboard>
        </DCSection>

        {/* ───────── 主畫面 ───────── */}
        <DCSection
          id="board"
          title="整體看板"
          subtitle="主畫面 · Rail + focus column"
        >
          <DCArtboard
            id="board-rail"
            label="B · Rail + focus column"
            width={1080}
            height={600}
          >
            <BoardRail dark={dark} />
          </DCArtboard>
        </DCSection>

        {/* ───────── 建立流程 ───────── */}
        <DCSection
          id="pipe-create"
          title="Pipeline 創建"
          subtitle="Rail ghost 展開 — 不離開看板"
        >
          <DCArtboard
            id="pipe-create-ghost"
            label="Pipeline create · rail ghost expand"
            width={1080}
            height={640}
          >
            <PipelineCreateGhost dark={dark} />
          </DCArtboard>
        </DCSection>

        <DCSection
          id="qa"
          title="Ticket 創建 Q&A"
          subtitle="A · Chat + draft 側欄"
        >
          <DCArtboard
            id="qa-side"
            label="A · Chat + draft 側欄"
            width={840}
            height={520}
          >
            <QAChatSide dark={dark} />
          </DCArtboard>
        </DCSection>

        {/* ───────── 細節互動 ───────── */}
        <DCSection
          id="drawer"
          title="Ticket drawer"
          subtitle="Drawer 各狀態的互動模型"
        >
          <DCArtboard
            id="drawer-step-done"
            label="Step · done · view"
            width={1080}
            height={680}
          >
            <DrawerStepDone dark={dark} />
          </DCArtboard>
          <DCArtboard
            id="drawer-iter-running"
            label="Iter · running · live"
            width={1080}
            height={680}
          >
            <DrawerIterRunning dark={dark} />
          </DCArtboard>
          <DCArtboard
            id="drawer-iter-paused"
            label="Iter · paused · intervention"
            width={1080}
            height={760}
          >
            <DrawerIterPaused dark={dark} />
          </DCArtboard>
          <DCArtboard
            id="iter-card-expanded"
            label="Iter card · expanded(展開細節)"
            width={760}
            height={900}
          >
            <IterCardExpanded dark={dark} />
          </DCArtboard>
          <DCArtboard
            id="drawer-branch-mismatch"
            label="Drawer · branch HEAD mismatch"
            width={1080}
            height={680}
          >
            <DrawerBranchMismatch dark={dark} />
          </DCArtboard>
        </DCSection>

        {/* ───────── 完成 ───────── */}
        <DCSection
          id="pipeline-state"
          title="Pipeline 完成狀態"
          subtitle="Ready to merge — 全綠完成、等使用者觸發"
        >
          <DCArtboard
            id="pipeline-ready"
            label="Pipeline · ready to merge"
            width={1080}
            height={640}
          >
            <PipelineReadyToMerge dark={dark} />
          </DCArtboard>
        </DCSection>

        {/* ───────── 環境(通知) ───────── */}
        <DCSection
          id="notif"
          title="通知系統"
          subtitle="B · Inbox 集中側欄 — default 折疊 strip"
        >
          <DCArtboard
            id="notif-inbox-strip"
            label="B' · Inbox 折疊 strip(default)"
            width={1080}
            height={600}
          >
            <NotifInboxStrip dark={dark} />
          </DCArtboard>
          <DCArtboard
            id="notif-inbox"
            label="B · Inbox 集中側欄(展開、疊在 Rail 看板上)"
            width={1080}
            height={600}
          >
            <NotifInboxOnRail dark={dark} />
          </DCArtboard>
        </DCSection>

        {/* ───────── 設定 ───────── */}
        <DCSection
          id="settings"
          title="Settings"
          subtitle="SKILL tab + Budget tab"
        >
          <DCArtboard
            id="settings-skill"
            label="Settings · SKILL tab"
            width={1080}
            height={760}
          >
            <SettingsSkill dark={dark} />
          </DCArtboard>
          <DCArtboard
            id="settings-budget"
            label="Settings · Budget tab"
            width={1080}
            height={840}
          >
            <SettingsBudget dark={dark} />
          </DCArtboard>
        </DCSection>

      </DesignCanvas>

      <TweaksPanel title="Tweaks">
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
