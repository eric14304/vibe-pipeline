import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../shell/AppShell";
import { Rail } from "../../shell/Rail";
import { FocusColumn } from "./FocusColumn";
import { CreateCard, CreatePlaceholder } from "../pipelineCreate/CreateCard";
import { EmptyProject } from "./EmptyProject";
import { InitPopup } from "../init/InitPopup";
import { useActiveProjectHash } from "../../hooks/useActiveProject";
import * as api from "../../api/projects";
import type { Pipeline } from "../../types/pipeline";
import type { Project } from "../../../shared/types";

export function BoardScreen({
  density = "medium",
  startCreating = false,
}: {
  density?: "compact" | "medium";
  startCreating?: boolean;
}) {
  const { hash } = useActiveProjectHash();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [creating, setCreating] = useState(startCreating);
  const [tick, setTick] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setCreating(startCreating);
  }, [startCreating]);

  useEffect(() => {
    if (!creating) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCreating(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [creating]);

  useEffect(() => {
    if (!hash) {
      setProject(null);
      setPipelines([]);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    api
      .status(hash)
      .then((p) => {
        if (cancelled) return;
        setProject(p);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [hash, reloadKey]);

  useEffect(() => {
    if (!project || !project.hasTickets) {
      setPipelines([]);
      return;
    }
    let cancelled = false;
    api
      .listPipelines(project.hash)
      .then((arr) => {
        if (cancelled) return;
        setPipelines((arr as Pipeline[]) ?? []);
        if ((arr as Pipeline[]).length > 0) setActiveId((id) => id || (arr as Pipeline[])[0].id);
      })
      .catch(() => {
        if (cancelled) return;
        setPipelines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const active = useMemo(
    () => pipelines.find((p) => p.id === activeId) || pipelines[0],
    [activeId, pipelines]
  );

  function handleCreate({
    name,
    baseBranch,
    mergeStrategy,
  }: {
    name: string;
    baseBranch: string;
    mergeStrategy: string;
  }) {
    const id = name;
    const pipeline: Pipeline = {
      id,
      name,
      branch: "pipeline/" + name,
      state: "planning",
      baseBranch,
      mergeStrategy,
      tickets: [],
    };
    setPipelines((arr) => [...arr, pipeline]);
    setActiveId(id);
    setCreating(false);
  }

  if (!hash) {
    return (
      <AppShell
        density={density}
        rail={<Rail pipelines={[]} activeId="" onSelect={() => {}} />}
        main={<EmptyProject />}
      />
    );
  }

  if (loadError) {
    return (
      <AppShell
        density={density}
        rail={<Rail pipelines={[]} activeId="" onSelect={() => {}} />}
        main={<EmptyProject message="找不到這個專案" hint={loadError} />}
      />
    );
  }

  if (!project) {
    return (
      <AppShell
        density={density}
        rail={<Rail pipelines={[]} activeId="" onSelect={() => {}} />}
        main={<EmptyProject message="載入中…" hint="" />}
      />
    );
  }

  const overlay = !project.hasTickets ? (
    <InitPopup
      project={project}
      onInitialized={(next) => {
        setProject(next);
        setReloadKey((k) => k + 1);
      }}
      onDismiss={() => setReloadKey((k) => k + 1)}
    />
  ) : undefined;

  return (
    <AppShell
      density={density}
      rail={
        <Rail
          pipelines={pipelines}
          activeId={activeId}
          onSelect={setActiveId}
          creating={creating}
          onStartCreate={() => setCreating(true)}
          createSlot={
            <CreateCard
              onCancel={() => setCreating(false)}
              onSubmit={handleCreate}
              existingNames={pipelines.map((p) => p.name)}
            />
          }
        />
      }
      main={
        creating ? (
          <CreatePlaceholder />
        ) : pipelines.length === 0 ? (
          <EmptyProject
            message="還沒任何 pipeline"
            hint="點左邊「+ 新 pipeline」建立第一條。"
          />
        ) : (
          <FocusColumn pipeline={active} tick={tick} />
        )
      }
      overlay={overlay}
    />
  );
}
