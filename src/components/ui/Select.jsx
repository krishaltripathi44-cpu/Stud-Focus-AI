"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../../lib/utils"
import { createPortal } from "react-dom"

const Select = React.forwardRef(({ className, children, ...props }, ref) => {
  const [open, setOpen] = React.useState(false)
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerRef = React.useRef(null)
  const contentRef = React.useRef(null)

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target) &&
          contentRef.current && !contentRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
    setOpen((prev) => !prev)
  }
  const close = () => setOpen(false)

  return (
    <div className={cn("relative", className)} {...props} ref={ref}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        if (child.type === SelectTrigger) {
          return React.cloneElement(child, { onClick: toggleOpen, "aria-expanded": open, ref: triggerRef })
        }
        if (child.type === SelectContent) {
          return React.cloneElement(child, { open, onClose: close, ref: contentRef, coords })
        }
        return child
      })}
    </div>
  )
})
Select.displayName = "Select"

const SelectTrigger = React.forwardRef(
  ({ className, children, "aria-expanded": ariaExpanded, ...props }, ref) => (
    <button
      type="button"
      role="combobox"
      aria-expanded={ariaExpanded || false}
      aria-haspopup="listbox"
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      {...props}
      ref={ref}
    >
      {children}
      <ChevronDown className="ml-2 h-4 w-4 opacity-50 transition-transform duration-200" style={{ transform: ariaExpanded ? "rotate(180deg)" : "rotate(0deg)" }} />
    </button>
  )
)
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = React.forwardRef(({ className, children, ...props }, ref) => (
  <span className={cn("flex items-center", className)} {...props} ref={ref}>
    {children}
  </span>
))
SelectValue.displayName = "SelectValue"

const SelectContent = React.forwardRef(({ className, children, open, onClose, coords, ...props }, ref) => {
  if (!open) return null

  const content = (
    <div
      className={cn(
        "max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-surface text-text shadow-md animate-in fade-in-0 zoom-in-95",
        className
      )}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        zIndex: 9999,
      }}
      {...props}
      ref={ref}
      role="listbox"
    >
      <div className="p-1">{children}</div>
    </div>
  )

  return createPortal(content, document.body)
})
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    role="option"
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
    ref={ref}
    onClick={onClose}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ChevronUp className="h-3.5 w-3.5" />
    </span>
    {children}
  </div>
))
SelectItem.displayName = "SelectItem"

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }