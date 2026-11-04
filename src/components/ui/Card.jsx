export function Card({ className, children, ...props }) {
  return (
    <div
      className={`
        rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children }) {
  return <div className={`flex flex-col gap-1 mb-3 ${className}`}>{children}</div>
}
export function CardTitle({ className, children }) {
  return <h3 className={`text-base font-semibold text-text ${className}`}>{children}</h3>
}
export function CardDescription({ className, children }) {
  return <p className={`text-sm text-text-muted ${className}`}>{children}</p>
}
export function CardContent({ className, children }) {
  return <div className={className}>{children}</div>
}
export function CardFooter({ className, children }) {
  return <div className={`mt-4 flex items-center justify-between gap-3 ${className}`}>{children}</div>
}
