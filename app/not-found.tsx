import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="card p-8 max-w-md text-center">
        <div className="text-[0.75rem] text-text-muted mb-2">
          404 · not found
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Off the index
        </h1>
        <p className="text-sm text-text-muted mb-5">
          That page or episode isn't in the archive. Try the dashboard or run a
          search.
        </p>
        <Link href="/dashboard" className="btn-primary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
