import React, { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as BabelModule from '@babel/standalone';
import { useBuildToolRequest, useCreateToolRequest, useGenerateGroundedSpec, useGroundToolRequest, useListToolRequests, usePublishToolRequest, getListToolRequestsQueryKey } from '@workspace/api-client-react';
import type { ToolRequest } from '@workspace/api-client-react';
import { AlertCircle, ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, Command, Copy, ExternalLink, FileText, Globe2, Layers3, Loader2, Maximize2, Plus, RefreshCw, Send, Sparkles, UploadCloud, Wrench, X } from 'lucide-react';

const examples = [
  'I need a daily production report that captures shoot day progress, company moves, weather, and anything that could affect tomorrow.',
  'Create a cast availability tracker for a six-week shoot with travel days, hold dates, conflicts, and approval notes.',
  'I need a simple petty cash log for set that tracks receipts, floats, reimbursements, and who signed off.',
];

const transformGeneratedTool = (BabelModule as unknown as {
  transform: (source: string, options: { presets: Array<string | [string, Record<string, unknown>]>; sourceType: string }) => { code?: string };
}).transform;

const statusCopy: Record<string, { label: string; tone: string; dot: string }> = {
  pending: { label: 'Interpreting', tone: 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--foreground))]', dot: 'bg-[hsl(var(--accent))]' },
  'spec-ready': { label: 'Ready to review', tone: 'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]', dot: 'bg-[hsl(var(--primary))]' },
  'facts-ready': { label: 'Facts to review', tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  'validation-failed': { label: 'Needs another try', tone: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  built: { label: 'Built', tone: 'bg-[hsl(191_42%_40%/.13)] text-[hsl(191_42%_30%)]', dot: 'bg-[hsl(191_42%_40%)]' },
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The PDF could not be read.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

function absolutePublishedUrl(value: string) {
  return new URL(value, window.location.origin).toString();
}

const developerLanguage = /\b(component|DOM|Canvas|API|runtime|source code|compil(?:e|ed|ation)|schema|prompt|implementation)\b/i;

function qualityCheckMessage(status: string, reason: string | null) {
  if (reason && !developerLanguage.test(reason)) return reason;
  return status === 'passed'
    ? 'Backlot checked that this tool follows your approved plan and can be used as intended.'
    : 'Backlot found that this version does not fully match your approved plan. Try building it again.';
}

function StatusBadge({ status }: { status: string }) {
  const copy = statusCopy[status] ?? statusCopy.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.12em] ${copy.tone}`} data-testid={`status-request-${status}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
      {copy.label}
    </span>
  );
}

function RequestSkeleton() {
  return (
    <div className="space-y-3" data-testid="loading-requests">
      {[1, 2, 3].map((item) => (
        <div className="h-[82px] animate-pulse rounded-xl border border-border bg-card/70 p-4" key={item}>
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="mt-4 h-2.5 w-1/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

class ToolErrorBoundary extends React.Component<{ children: React.ReactNode; onError: (error: Error) => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

function GeneratedTool({ code, onError }: { code: string; onError: (error: Error) => void }) {
  const [compileError, setCompileError] = useState<Error | null>(null);
  const Component = useMemo(() => {
    try {
      const source = code
        .replace(/^\s*import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["']\s*;?\s*$/gm, '')
        .replace(/^\s*import\s+\{[^}]*\}\s+from\s+["']react["']\s*;?\s*$/gm, '')
        .replace(/export\s+default\s+GeneratedTool\s*;?/g, '')
        .replace(/export\s+default\s+/g, '')
        .replace(/(?:const|let|var)\s*\{\s*useState\s*,\s*useEffect\s*\}\s*=\s*React\s*;?/g, '')
        .replace(/(?:const|let|var)\s*\{\s*useEffect\s*,\s*useState\s*\}\s*=\s*React\s*;?/g, '');
      const transformed = transformGeneratedTool(`const { useState, useEffect } = React;\n${source}`, {
        presets: [['react', { runtime: 'classic' }]],
        sourceType: 'script',
      }).code;
      if (!transformed) throw new Error('Backlot could not prepare this tool.');
      return new Function('React', `${transformed}\nreturn typeof GeneratedTool === 'function' ? GeneratedTool : null;`)(React) as React.ComponentType | null;
    } catch (error) {
      setCompileError(error instanceof Error ? error : new Error('Backlot could not prepare this tool.'));
      return null;
    }
  }, [code]);
  React.useEffect(() => {
    if (compileError) onError(compileError);
  }, [compileError, onError]);

  if (compileError || !Component) return <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">This tool needs to be rebuilt before it can open.</div>;
  return <ToolErrorBoundary onError={onError}><Component /></ToolErrorBoundary>;
}

export default function Home() {
  const queryClient = useQueryClient();
  const [requestText, setRequestText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [groundedMode, setGroundedMode] = useState<'production' | 'interactive'>('production');
  const [activeRequest, setActiveRequest] = useState<ToolRequest | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'workspace' | 'history'>('workspace');
  const { data: requests, isLoading, isError, refetch } = useListToolRequests();
  const createRequest = useCreateToolRequest();
  const groundRequest = useGroundToolRequest();
  const generateGroundedSpec = useGenerateGroundedSpec();
  const buildRequest = useBuildToolRequest();
  const publishRequest = usePublishToolRequest();
  const [toolRequest, setToolRequest] = useState<ToolRequest | null>(null);
  const [toolRuntimeError, setToolRuntimeError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<{ id: number; message: string } | null>(null);
  const [publishError, setPublishError] = useState<{ id: number; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [activeNav, setActiveNav] = useState<'workspace' | 'history' | 'plan'>('workspace');
  const [showGuide, setShowGuide] = useState(false);

  const sortedRequests = useMemo(
    () => [...(requests ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [requests],
  );

  const selected = activeRequest ?? sortedRequests[0] ?? null;

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = requestText.trim();
    if (trimmed.length < 3 || createRequest.isPending || groundRequest.isPending) return;
    setHasSubmitted(true);
    if (pdfFile) {
      try {
        const pdfBase64 = await fileToBase64(pdfFile);
        groundRequest.mutate({ data: { requestText: trimmed, pdfBase64, pdfName: pdfFile.name } }, {
          onSuccess: (created) => {
            setActiveRequest(created);
            setRequestText('');
            setPdfFile(null);
            queryClient.invalidateQueries({ queryKey: getListToolRequestsQueryKey() });
          },
        });
      } catch {
        setHasSubmitted(false);
      }
      return;
    }
    createRequest.mutate(
      { data: { requestText: trimmed } },
      {
        onSuccess: (created) => {
          setActiveRequest(created);
          setRequestText('');
          queryClient.invalidateQueries({ queryKey: getListToolRequestsQueryKey() });
        },
        onError: () => setHasSubmitted(false),
      },
    );
  }

  function createSpecFromFacts(request: ToolRequest) {
    if (generateGroundedSpec.isPending) return;
    generateGroundedSpec.mutate({ id: request.id, data: { mode: groundedMode } }, {
      onSuccess: (updated) => {
        setActiveRequest(updated);
        queryClient.invalidateQueries({ queryKey: getListToolRequestsQueryKey() });
      },
    });
  }

  function buildTool(request: ToolRequest) {
    if (buildRequest.isPending) return;
    setBuildError(null);
    buildRequest.mutate({ id: request.id }, {
      onSuccess: (built) => {
        setActiveRequest(built);
        queryClient.invalidateQueries({ queryKey: getListToolRequestsQueryKey() });
        setToolRequest(built);
        setToolRuntimeError(null);
      },
      onError: (error) => {
        const message = (error as { data?: { error?: string } })?.data?.error ?? 'Backlot couldn’t build this tool. Please try again.';
        setBuildError({ id: request.id, message });
      },
    });
  }

  function publishTool(request: ToolRequest) {
    if (publishRequest.isPending) return;
    setPublishError(null);
    publishRequest.mutate({ id: request.id }, {
      onSuccess: (published) => {
        setActiveRequest((current) => current?.id === published.id ? published : current);
        setToolRequest((current) => current?.id === published.id ? published : current);
        queryClient.invalidateQueries({ queryKey: getListToolRequestsQueryKey() });
      },
      onError: (error) => {
        const message = (error as { data?: { error?: string } })?.data?.error ?? (error instanceof Error ? error.message : 'Publishing failed for an unknown reason.');
        setPublishError({ id: request.id, message });
      },
    });
  }

  async function copyPublishedUrl(request: ToolRequest) {
    if (!request.publishedUrl) return;
    try {
      await navigator.clipboard.writeText(absolutePublishedUrl(request.publishedUrl));
      setCopiedId(request.id);
      window.setTimeout(() => setCopiedId((current) => current === request.id ? null : current), 1800);
    } catch (error) {
      setPublishError({ id: request.id, message: error instanceof Error ? `Copy failed: ${error.message}` : 'Copy failed.' });
    }
  }

  function navigateTo(section: 'workspace' | 'history' | 'plan') {
    setActiveNav(section);
    setMobilePanel(section === 'history' ? 'history' : 'workspace');
    window.requestAnimationFrame(() => {
      document.getElementById(section === 'workspace' ? 'workspace-section' : section === 'history' ? 'request-history-section' : 'tool-plan-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className="backlot-noise min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[76px] flex-col items-center border-r border-sidebar-border bg-sidebar py-6 text-sidebar-foreground md:flex" data-testid="sidebar-navigation">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground shadow-[0_8px_20px_hsl(var(--sidebar-primary)/.22)]" data-testid="brand-mark">
          B
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-accent" />
        </div>
        <div className="mt-14 flex flex-col items-center gap-4">
          <button onClick={() => navigateTo('workspace')} aria-label="Go to workspace" aria-current={activeNav === 'workspace' ? 'page' : undefined} className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105 ${activeNav === 'workspace' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="button-workspace">
            <Command className="h-[17px] w-[17px]" />
            <span className="absolute left-[62px] hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background group-hover:block">Workspace</span>
          </button>
          <button onClick={() => navigateTo('history')} aria-label="Go to request history" aria-current={activeNav === 'history' ? 'page' : undefined} className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${activeNav === 'history' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="button-history">
            <Clock3 className="h-[17px] w-[17px]" />
            <span className="absolute left-[62px] hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background group-hover:block">Request history</span>
          </button>
          <button onClick={() => navigateTo('plan')} aria-label="Go to tool plan" aria-current={activeNav === 'plan' ? 'page' : undefined} className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${activeNav === 'plan' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="button-specs">
            <FileText className="h-[17px] w-[17px]" />
            <span className="absolute left-[62px] hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background group-hover:block">Tool plan</span>
          </button>
        </div>
        <div className="mt-auto flex flex-col items-center gap-4">
          <div className="h-px w-7 bg-sidebar-border" />
          <button onClick={() => setShowGuide(true)} className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-sidebar-foreground/70 transition hover:border-sidebar-primary hover:text-sidebar-primary" aria-label="How Backlot works" data-testid="button-user-guide">
            <CircleHelp className="h-4 w-4" />
            <span className="absolute left-[62px] hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background group-hover:block">How Backlot works</span>
          </button>
        </div>
      </aside>

      <main className="md:pl-[76px]">
        <header className="flex h-[72px] items-center justify-between border-b border-border px-5 md:px-10" data-testid="header-workspace">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground md:hidden">B</div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Production office</p>
              <p className="mt-0.5 text-sm font-semibold tracking-[-.01em]">Backlot <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">/ workspace</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(191_42%_40%)]" /> Desk is ready
            </span>
            <div className="h-5 w-px bg-border" />
            <span className="font-mono text-[10px] text-muted-foreground">V.01</span>
          </div>
        </header>

        <div id="workspace-section" className="mx-auto max-w-[1540px] scroll-mt-4 px-5 py-7 md:px-10 md:py-10">
          <div className="mb-7 flex items-center gap-1 rounded-lg border border-border bg-card p-1 md:hidden">
            <button className={`flex-1 rounded-md px-3 py-2 font-mono text-[10px] uppercase tracking-[.15em] transition-colors ${mobilePanel === 'workspace' ? 'bg-foreground text-background' : 'text-muted-foreground'}`} onClick={() => setMobilePanel('workspace')} data-testid="button-mobile-workspace">Workspace</button>
            <button className={`flex-1 rounded-md px-3 py-2 font-mono text-[10px] uppercase tracking-[.15em] transition-colors ${mobilePanel === 'history' ? 'bg-foreground text-background' : 'text-muted-foreground'}`} onClick={() => setMobilePanel('history')} data-testid="button-mobile-history">History</button>
          </div>

          <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className={`${mobilePanel === 'history' ? 'hidden md:block' : ''}`}>
              <div className="backlot-rise max-w-[830px]">
                <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Brief to blueprint
                </div>
                <h1 className="max-w-[700px] font-serif text-[clamp(2.5rem,6vw,5.65rem)] font-semibold leading-[.94] tracking-[-.065em]">
                  Put the busywork<br /><span className="text-primary">on the page.</span>
                </h1>
                <p className="mt-6 max-w-[560px] text-[15px] leading-7 text-muted-foreground">
                  Describe a production need in plain English. Backlot turns the brief into a considered tool specification for your review — before anything gets built.
                </p>
              </div>

              <div className="backlot-rise backlot-rise-delay-1 mt-10 max-w-[830px]">
                <form onSubmit={submitRequest} className="relative overflow-hidden rounded-2xl border border-foreground/15 bg-card shadow-[0_22px_60px_hsl(var(--foreground)/.07)]" data-testid="form-tool-request">
                  <div className="absolute left-0 right-0 top-0 h-1 bg-primary" />
                  <div className="p-5 pt-7 md:p-7 md:pt-8">
                    <div className="mb-5 flex items-center justify-between">
                      <label className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground" htmlFor="request-input">What are you solving?</label>
                      <span className="font-mono text-[10px] text-muted-foreground/70">01 / BRIEF</span>
                    </div>
                    <textarea
                      id="request-input"
                      value={requestText}
                      onChange={(event) => setRequestText(event.target.value)}
                      placeholder="e.g. I need a way to track daily call sheet changes across three units…"
                      className="backlot-textarea w-full resize-none border-0 bg-transparent p-0 text-[18px] leading-8 text-foreground outline-none placeholder:text-muted-foreground/55 focus:ring-0 md:text-[21px]"
                      data-testid="input-request-text"
                    />
                     <div className="mt-7 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                       <div className="space-y-2">
                         <p className="max-w-[330px] text-xs leading-5 text-muted-foreground">Add a script or production PDF to ground the tool in real entities.</p>
                         <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary">
                           <UploadCloud className="h-3.5 w-3.5" /> {pdfFile ? pdfFile.name : 'Attach PDF'}
                           <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)} data-testid="input-pdf" />
                         </label>
                         {pdfFile && <button type="button" onClick={() => setPdfFile(null)} className="ml-2 text-xs text-destructive underline">Remove</button>}
                       </div>
                       <button type="submit" disabled={requestText.trim().length < 3 || createRequest.isPending || groundRequest.isPending} className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-[hsl(var(--primary)/.9)] hover:shadow-[0_8px_18px_hsl(var(--primary)/.2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none" data-testid="button-submit-request">
                          {createRequest.isPending || groundRequest.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> {pdfFile ? 'Reading your PDF' : 'Reading the brief'}</> : <><Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /> {pdfFile ? 'Find document facts' : 'Make a tool plan'}</>}
                      </button>
                    </div>
                  </div>
                  {createRequest.isPending && <div className="h-0.5 w-full overflow-hidden bg-primary/10"><div className="h-full w-1/3 animate-[backlot-scan_1.1s_ease-in-out_infinite] bg-primary" /></div>}
                </form>
                 {hasSubmitted && (createRequest.isError || groundRequest.isError) && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" data-testid="error-create-request">
                     <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {((groundRequest.error ?? createRequest.error) as { data?: { error?: string } })?.data?.error ?? 'We couldn’t read that brief. Try again.'}</span>
                    <button className="font-semibold underline underline-offset-4" onClick={() => setHasSubmitted(false)} data-testid="button-dismiss-create-error">Dismiss</button>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2" data-testid="list-request-examples">
                  {examples.map((example, index) => (
                    <button key={example} onClick={() => setRequestText(example)} className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground" data-testid={`button-example-${index}`}>
                      <Plus className="h-3 w-3 text-primary transition-transform group-hover:rotate-90" /> {index === 0 ? 'Daily report' : index === 1 ? 'Cast availability' : 'Petty cash'}
                    </button>
                  ))}
                </div>
              </div>

              <div id="tool-plan-section" className="backlot-rise backlot-rise-delay-2 mt-16 max-w-[830px] scroll-mt-6" data-testid="section-spec-review">
                <div className="mb-5 flex items-end justify-between border-b border-border pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">02 / Review before building</p>
                    <h2 className="mt-2 font-serif text-2xl font-semibold tracking-[-.04em]">Your tool plan</h2>
                  </div>
                  {selected && <StatusBadge status={selected.status} />}
                </div>
                {selected?.status === 'facts-ready' && selected.groundedFacts ? (
                  <div className="rounded-2xl border border-amber-300/60 bg-card p-5 md:p-7" data-testid={`card-grounded-facts-${selected.id}`}>
                    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                      <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-amber-700">Found in {selected.sourcePdfName}</p><h3 className="mt-2 font-serif text-3xl font-semibold">Check the facts from your document</h3></div>
                      <StatusBadge status={selected.status} />
                    </div>
                    <div className="grid gap-5 py-6 sm:grid-cols-2">
                      {Object.entries(selected.groundedFacts).map(([category, values]) => (
                        <div key={category}><p className="mb-2 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">{category.replace(/([A-Z])/g, ' $1')}</p>
                          <div className="flex flex-wrap gap-2">{values.length ? (values as string[]).map((value: string) => <span key={value} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">{value}</span>) : <span className="text-xs italic text-muted-foreground">None found</span>}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mb-4 rounded-xl border border-border bg-background/60 p-4">
                      <p className="mb-3 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Choose what Backlot should build</p>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tool mode">
                        <button type="button" role="radio" aria-checked={groundedMode === 'production'} onClick={() => setGroundedMode('production')} className={`rounded-lg border px-4 py-3 text-left transition ${groundedMode === 'production' ? 'border-primary bg-primary/[.08] text-primary' : 'border-border'}`} data-testid="mode-production">
                          <span className="block text-sm font-semibold">Production</span><span className="mt-1 block text-xs text-muted-foreground">Operational tool and records</span>
                        </button>
                        <button type="button" role="radio" aria-checked={groundedMode === 'interactive'} onClick={() => setGroundedMode('interactive')} className={`rounded-lg border px-4 py-3 text-left transition ${groundedMode === 'interactive' ? 'border-primary bg-primary/[.08] text-primary' : 'border-border'}`} data-testid="mode-interactive">
                          <span className="block text-sm font-semibold">Interactive</span><span className="mt-1 block text-xs text-muted-foreground">Minimal match or branch game</span>
                        </button>
                      </div>
                    </div>
                    <button onClick={() => createSpecFromFacts(selected)} disabled={generateGroundedSpec.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid={`button-generate-grounded-spec-${selected.id}`}>
                      {generateGroundedSpec.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating your tool plan</> : <><Check className="h-4 w-4" /> Use these facts — create {groundedMode === 'interactive' ? 'interactive game' : 'production tool'}</>}
                    </button>
                    {generateGroundedSpec.isError && <p className="mt-3 text-sm text-destructive">{(generateGroundedSpec.error as { data?: { error?: string } })?.data?.error ?? 'Backlot couldn’t prepare the tool plan. Please try again.'}</p>}
                  </div>
                ) : selected?.spec ? (
                  <div className="rounded-2xl border border-border bg-card p-5 md:p-7" data-testid={`card-spec-${selected.id}`}>
                    <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Suggested setup</p>
                        <h3 className="mt-2 font-serif text-3xl font-semibold tracking-[-.045em]">{selected.spec.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-[hsl(191_42%_40%)]" /> Ready for your review
                      </div>
                    </div>
                    <div className="grid gap-7 py-6 md:grid-cols-[1.1fr_.9fr]">
                      <div>
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Purpose</p>
                        <p className="text-sm leading-6 text-foreground/80">{selected.spec.purpose}</p>
                      </div>
                      <div>
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Original brief</p>
                         <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">“{selected.requestText}”</p>
                      </div>
                    </div>
                    {selected.supervisorStatus && <div className={`mt-5 rounded-xl border p-4 text-sm ${selected.supervisorStatus === 'passed' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-destructive/25 bg-destructive/5 text-destructive'}`} data-testid={`supervisor-result-${selected.id}`}><strong>Quality check: {selected.supervisorStatus === 'passed' ? 'Passed' : 'Needs another try'}</strong><p className="mt-1 text-xs leading-5">{qualityCheckMessage(selected.supervisorStatus, selected.supervisorReason)}</p></div>}
                    <div className="grid gap-7 border-t border-border pt-6 md:grid-cols-2">
                      <div>
                        <div className="mb-3 flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Information it tracks</p><span className="font-mono text-[10px] text-muted-foreground">{selected.spec.fields.length} items</span></div>
                        <div className="space-y-2">
                          {selected.spec.fields.map((field) => (
                            <div className="rounded-lg border border-border/80 bg-background/60 px-3 py-2.5" key={field.name} data-testid={`field-spec-${selected.id}-${field.name}`}>
                              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{field.name}</p><span className="font-mono text-[9px] uppercase tracking-[.1em] text-primary">{field.type}</span></div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{field.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">What you can do</p>
                        <div className="space-y-2">
                          {selected.spec.actions.map((action) => (
                            <div className="flex gap-3 rounded-lg border border-border/80 bg-background/60 px-3 py-3" key={action.label} data-testid={`action-spec-${selected.id}-${action.label}`}>
                              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <div><p className="text-sm font-semibold">{action.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {selected.spec.mode === 'interactive' && selected.spec.interactive && (
                      <div className="mt-6 rounded-xl border border-primary/25 bg-primary/[.04] p-4" data-testid={`interactive-spec-${selected.id}`}>
                        <div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-primary">How the game works</p><span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] uppercase text-primary-foreground">{selected.spec.interactive.mechanic}</span></div>
                        <p className="mt-3 text-sm">{selected.spec.interactive.instructions}</p>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Finish when:</strong> {selected.spec.interactive.winCondition}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{selected.spec.interactive.entities.length} characters, props, or scenes from your PDF</p>
                      </div>
                    )}
                    <div className="mt-7 flex flex-col gap-3 rounded-xl border border-dashed border-primary/35 bg-primary/[.035] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-3"><Wrench className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">{selected.status === 'built' ? 'This tool is ready to use.' : 'This plan is ready for your approval.'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.status === 'built' ? 'Open it from the archive whenever you need it.' : 'Build it from the archive when you are ready. Backlot will turn this approved plan into a ready-to-use tool.'}</p></div></div>
                      <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[.13em] text-muted-foreground">{selected.status === 'built' ? 'Ready to use' : 'Build from archive'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="backlot-grid flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border px-8 text-center" data-testid="empty-spec-state">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><Layers3 className="h-5 w-5" /></div>
                    <h3 className="font-serif text-xl font-semibold tracking-[-.03em]">Your spec will land here.</h3>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Start with a real production need above. We’ll keep the first pass clear enough to approve at a glance.</p>
                  </div>
                )}
              </div>
            </section>

            <aside id="request-history-section" className={`${mobilePanel === 'workspace' ? 'hidden md:block' : ''} scroll-mt-6 xl:sticky xl:top-8`} data-testid="section-request-history">
              <div className="backlot-rise backlot-rise-delay-1 rounded-2xl border border-border bg-card/65 p-5 md:p-6">
                <div className="mb-5 flex items-start justify-between">
                  <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Archive</p><h2 className="mt-2 font-serif text-2xl font-semibold tracking-[-.04em]">Request history</h2></div>
                  <button onClick={() => refetch()} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" aria-label="Refresh request history" data-testid="button-refresh-history"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mb-5 flex items-center gap-2 border-b border-border pb-4 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground"><span className="text-foreground">{sortedRequests.length}</span> {sortedRequests.length === 1 ? 'request' : 'requests'} on file <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(191_42%_40%)]" /></div>
                {isLoading ? <RequestSkeleton /> : isError ? (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4" data-testid="error-load-requests"><div className="flex gap-3"><AlertCircle className="h-4 w-4 shrink-0 text-destructive" /><div><p className="text-sm font-semibold">History is out of reach.</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The desk couldn’t load saved requests.</p><button onClick={() => refetch()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-destructive underline underline-offset-4" data-testid="button-retry-history">Try again <ChevronRight className="h-3 w-3" /></button></div></div></div>
                ) : sortedRequests.length === 0 ? (
                  <div className="backlot-grid rounded-xl border border-dashed border-border px-5 py-9 text-center" data-testid="empty-request-history"><p className="font-serif text-lg font-semibold">No briefs yet.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Your reviewed production needs will stay here for reference.</p></div>
                ) : (
                  <div className="backlot-scroll max-h-[650px] space-y-2 overflow-y-auto pr-1">
                    {sortedRequests.map((request) => (
                      <div key={request.id} className={`rounded-xl border p-4 transition-all duration-200 hover:border-primary/35 hover:shadow-[0_8px_20px_hsl(var(--foreground)/.05)] ${selected?.id === request.id ? 'border-primary/45 bg-primary/[.045]' : 'border-border bg-background/35'}`} data-testid={`card-history-request-${request.id}`}>
                        <button onClick={() => { setActiveRequest(request); setMobilePanel('workspace'); }} className="group w-full text-left" data-testid={`button-history-request-${request.id}`}>
                           <div className="mb-3 flex items-start justify-between gap-3"><p className="line-clamp-2 text-sm font-semibold leading-5">{request.spec?.name ?? `Facts from ${request.sourcePdfName ?? 'PDF'}`}</p><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div>
                           <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><StatusBadge status={request.status} />{request.publishedUrl && <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(191_42%_30%)]"><Globe2 className="h-3 w-3" /> Live</span>}</div><span className="font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">{formatDate(request.createdAt)}</span></div>
                        </button>
                         {['spec-ready', 'validation-failed'].includes(request.status) && (
                          <div className="mt-3 border-t border-border/70 pt-3">
                            <button onClick={() => buildTool(request)} disabled={buildRequest.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-[hsl(var(--primary)/.9)] disabled:cursor-wait disabled:opacity-60" data-testid={`button-build-tool-${request.id}`}>
                              {buildRequest.isPending && buildRequest.variables?.id === request.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating tool</> : <><Wrench className="h-3.5 w-3.5" /> Build this tool</>}
                            </button>
                          </div>
                        )}
                        {request.status === 'built' && request.generatedCode && (
                           <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
                             {request.publishedUrl && (
                               <div className="rounded-lg border border-[hsl(191_42%_40%/.25)] bg-[hsl(191_42%_40%/.06)] p-2.5" data-testid={`published-url-${request.id}`}>
                                 <div className="flex items-center gap-2">
                                   <a href={absolutePublishedUrl(request.publishedUrl)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[hsl(191_42%_30%)] underline decoration-[hsl(191_42%_40%/.35)] underline-offset-4" data-testid={`link-published-tool-${request.id}`}>{absolutePublishedUrl(request.publishedUrl)}</a>
                                   <button onClick={() => copyPublishedUrl(request)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(191_42%_40%/.25)] bg-background text-[hsl(191_42%_30%)]" aria-label="Copy published link" data-testid={`button-copy-link-${request.id}`}>{copiedId === request.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                                 </div>
                               </div>
                             )}
                             <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => { setToolRequest(request); setToolRuntimeError(null); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/[.06] px-3 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/[.12]" data-testid={`button-view-tool-${request.id}`}>
                              <Maximize2 className="h-3.5 w-3.5" /> View tool
                            </button>
                             {request.publishedUrl ? (
                               <a href={absolutePublishedUrl(request.publishedUrl)} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(191_42%_34%)] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[hsl(191_42%_29%)]" data-testid={`button-open-published-${request.id}`}><ExternalLink className="h-3.5 w-3.5" /> Open live</a>
                             ) : (
                               <button onClick={() => publishTool(request)} disabled={publishRequest.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-xs font-semibold text-background transition hover:bg-foreground/85 disabled:cursor-wait disabled:opacity-60" data-testid={`button-publish-tool-${request.id}`}>
                                 {publishRequest.isPending && publishRequest.variables?.id === request.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing</> : <><UploadCloud className="h-3.5 w-3.5" /> Publish</>}
                               </button>
                             )}
                             </div>
                          </div>
                        )}
                        {buildError?.id === request.id && (
                          <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive" data-testid={`error-build-tool-${request.id}`}>
                            <div className="flex gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{buildError.message}</p></div>
                            <button onClick={() => buildTool(request)} className="mt-2 font-semibold underline underline-offset-4" data-testid={`button-retry-build-${request.id}`}>Try building again</button>
                          </div>
                        )}
                         {publishError?.id === request.id && (
                           <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive" data-testid={`error-publish-tool-${request.id}`}>
                             <div className="flex gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{publishError.message}</p></div>
                             <button onClick={() => publishTool(request)} className="mt-2 font-semibold underline underline-offset-4" data-testid={`button-retry-publish-${request.id}`}>Retry publishing</button>
                           </div>
                         )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 hidden rounded-xl border border-border bg-secondary/40 p-4 xl:block" data-testid="note-review-gate"><div className="flex gap-3"><div className="mt-0.5 h-5 w-5 rounded-full border border-primary/45 text-center font-mono text-[10px] leading-[18px] text-primary">i</div><p className="text-xs leading-5 text-muted-foreground">Every brief is saved to your archive. Nothing is built without a producer looking at the spec first.</p></div></div>
            </aside>
          </div>
        </div>
      </main>
      {toolRequest?.generatedCode && toolRequest.spec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--foreground)/.62)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${toolRequest.spec.name} tool`}>
          <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-7">
              <div><p className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">Ready to use</p><h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-.04em]">{toolRequest.spec.name}</h2></div>
              <button onClick={() => setToolRequest(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary" aria-label="Close tool viewer" data-testid="button-close-tool"><X className="h-4 w-4" /></button>
            </div>
            <div className="backlot-scroll min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
              {toolRuntimeError ? <div className="mx-auto max-w-lg rounded-xl border border-destructive/25 bg-destructive/5 p-5" data-testid="error-tool-runtime">
                <div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-semibold">This tool could not open.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Backlot couldn’t open the saved version. Rebuild it to get a fresh working copy.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Backlot will never replace your tool with unrelated sample content.</p><button onClick={() => { setToolRequest(null); buildTool(toolRequest); }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground" data-testid="button-retry-runtime-generation"><RefreshCw className="h-3.5 w-3.5" /> Rebuild tool</button></div></div>
              </div> : <GeneratedTool code={toolRequest.generatedCode} onError={(error) => setToolRuntimeError(error.message)} />}
            </div>
          </div>
        </div>
      )}
      {showGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[hsl(var(--foreground)/.62)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="backlot-guide-title" data-testid="dialog-user-guide">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">Quick guide</p><h2 id="backlot-guide-title" className="mt-2 font-serif text-3xl font-semibold">How to use Backlot</h2></div>
              <button onClick={() => setShowGuide(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary" aria-label="Close guide" data-testid="button-close-user-guide"><X className="h-4 w-4" /></button>
            </div>
            <ol className="mt-6 space-y-4 text-sm leading-6">
              <li><strong>1. Describe the job.</strong> Explain the production task you want help with in everyday language.</li>
              <li><strong>2. Add a PDF when details matter.</strong> Backlot finds characters, scenes, props, locations, and rights mentions for you to check.</li>
              <li><strong>3. Review before building.</strong> Confirm the plan, then choose a production tool or a short interactive game.</li>
              <li><strong>4. Build and open.</strong> Your finished tool stays in Request history, where you can use it or publish a shareable link.</li>
            </ol>
            <button onClick={() => { setShowGuide(false); navigateTo('workspace'); }} className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground" data-testid="button-start-from-guide">Start a production brief</button>
          </div>
        </div>
      )}
    </div>
  );
}