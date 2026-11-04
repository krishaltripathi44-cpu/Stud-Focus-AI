import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function Button({ className, variant = 'primary', size = 'md', disabled, children, ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-2'
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover focus:ring-accent shadow-lg shadow-accent/25 active:scale-[0.98]',
    secondary: 'bg-surface border border-border text-text hover:bg-accent/5 focus:ring-border dark:bg-surface dark:border-border dark:text-text',
    outline: 'border border-border text-text hover:bg-accent/5 hover:text-accent focus:ring-accent bg-transparent',
    ghost: 'text-text-muted hover:bg-accent/5 hover:text-text focus:ring-accent bg-transparent',
    danger: 'bg-error text-white hover:bg-red-600 focus:ring-error',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }
  return (
    <button className={twMerge(base, variants[variant], sizes[size], className)} disabled={disabled} {...props}>
      {children}
    </button>
  )
}
