export function Skeleton({ className, height = '16px', width = '100%', ...props }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width }}
      {...props}
    />
  )
}

export function SkeletonLine({ className, width = '60%', ...props }) {
  return <Skeleton className={className} height="14px" width={width} {...props} />
}
