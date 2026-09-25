type LoadingScreenProps = {
  label?: string;
  detail?: string;
};

export function LoadingScreen({
  label = "Loading your workspace",
  detail = "Syncing your learning data…",
}: LoadingScreenProps) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-sand/65 px-6 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-full max-w-sm border-2 border-ink bg-paper/95 p-8 text-center shadow-[12px_12px_0_var(--color-ink)]">
        <div className="relative mx-auto size-20" aria-hidden="true">
          <div className="loading-orbit absolute inset-1 border-2 border-clay border-t-transparent" />
          <div className="loading-orbit-reverse absolute inset-3 border-2 border-moss border-b-transparent" />
          <div className="loading-core absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 bg-ink" />
          <div className="loading-spark absolute left-1/2 top-0 size-2 -translate-x-1/2 bg-clay" />
        </div>

        <div className="mt-6 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink">
          {label}
        </div>
        <div className="mt-2 text-sm text-fog">{detail}</div>
        <div className="loading-scan mx-auto mt-6 h-1 w-36 overflow-hidden bg-ink/10">
          <div className="h-full w-1/3 bg-clay" />
        </div>
      </div>
    </div>
  );
}
