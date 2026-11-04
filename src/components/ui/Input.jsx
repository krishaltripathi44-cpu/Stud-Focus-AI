export function Input({ className, ...props }) {
  return (
    <input
      className={`
        flex-1 block w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-text
        placeholder:text-text/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
        transition-colors disabled:bg-surface/50 disabled:text-text/30
        ${className}
      `}
      {...props}
    />
  )
}
