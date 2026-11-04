export function Badge({ className, variant = 'default', children }) {
  const variants = {
    default: 'bg-surface border border-border text-text-muted',
    accent: 'bg-accent/10 border border-accent/20 text-accent',
    success: 'bg-success/10 border border-success/20 text-success',
    warning: 'bg-warning/10 border border-warning/20 text-warning',
    error: 'bg-error/10 border border-error/20 text-error',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
