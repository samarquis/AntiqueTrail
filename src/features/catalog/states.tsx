export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="catalog-state catalog-state--error" role="alert">
      <h2>We couldn’t load the stores</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </section>
  )
}

export function LoadingState() {
  return (
    <section className="catalog-state catalog-state--loading" role="status" aria-live="polite">
      <h2>Finding stores</h2>
      <p>Loading current store details…</p>
    </section>
  )
}
