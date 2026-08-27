export default function DashboardLoading() {
  return <main className="route-loading" aria-live="polite" aria-busy="true"><div className="loading-bar"/><div className="loading-grid">{[1, 2, 3, 4].map((item) => <div className="loading-card" key={item}/>)}</div><span className="sr-only">Loading page</span></main>;
}
