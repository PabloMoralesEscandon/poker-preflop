export function HomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Drills</h1>
      <p className="text-fg-muted max-w-prose text-sm">
        Pick a drill to start a session. The drill list is loaded from the
        server and rendered from its declarative config schema, so this page
        does not hardcode any drill.
      </p>
      <div className="border-line bg-surface text-fg-muted rounded-lg border border-dashed p-6 text-sm">
        No drills loaded yet.
      </div>
    </section>
  );
}
