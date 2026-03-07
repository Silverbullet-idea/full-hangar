export default function Loading() {
  return (
    <div className="nav-loading-overlay" role="status" aria-live="polite" aria-label="Loading next page">
      <div className="nav-loading-spinner-shell">
        <img src="/branding/nav-loading-spinner.png" alt="Loading" className="nav-loading-spinner-image" />
      </div>
    </div>
  )
}
