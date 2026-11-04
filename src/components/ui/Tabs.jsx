"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

const Tabs = ({ className, defaultValue, value, onValueChange, children, ...props }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const controlled = value !== undefined
  const currentValue = controlled ? value : internalValue

  const handleChange = (newValue) => {
    if (!controlled) setInternalValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        if (child.type === TabsList) {
          return React.cloneElement(child, { value: currentValue, onValueChange: handleChange })
        }
        if (child.type === TabsTrigger) {
          return React.cloneElement(child, { value: currentValue })
        }
        if (child.type === TabsContent) {
          return React.cloneElement(child, { value: currentValue })
        }
        return child
      })}
    </div>
  )
}
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef(({ className, children, value, onValueChange, ...props }, ref) => (
  <div
    role="tablist"
    aria-orientation="horizontal"
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-text",
      className
    )}
    {...props}
    ref={ref}
  >
    {React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) return child
      if (child.type === TabsTrigger) {
        return React.cloneElement(child, { value, onValueChange })
      }
      return child
    })}
  </div>
))
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef(
  ({ className, value, onValueChange, disabled, children, ...props }, ref) => {
    const currentValue = React.useContext(TabsContext)
    const isActive = value === currentValue
    return (
      <button
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabs-content-${value}`}
        id={`tabs-trigger-${value}`}
        data-state={isActive ? "active" : "inactive"}
        data-disabled={disabled ? "" : undefined}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
          className
        )}
        onClick={() => !disabled && onValueChange?.(value)}
        {...props}
        ref={ref}
      >
        {children}
      </button>
    )
  }
)
TabsTrigger.displayName = "TabsTrigger"

const TabsContext = React.createContext(null)

const TabsContent = React.forwardRef(
  ({ className, value, forceMount, children, ...props }, ref) => {
    const currentValue = React.useContext(TabsContext)
    const isActive = value === currentValue
    if (!isActive && !forceMount) return null
    return (
      <div
        role="tabpanel"
        id={`tabs-content-${value}`}
        aria-labelledby={`tabs-trigger-${value}`}
        className={cn(
          "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:animate-in data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=active]:fade-in-0",
          className
        )}
        {...props}
        ref={ref}
        hidden={!isActive}
      >
        {children}
      </div>
    )
  }
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsContext }