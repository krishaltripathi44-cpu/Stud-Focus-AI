import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from './Button'
import { Card, CardHeader, CardDescription, CardFooter } from './Card'

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Delete',
  confirmVariant = 'danger',
  children,
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md animate-fade-in">
          <CardHeader className="mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning" />
              <span className="text-lg font-semibold text-text">{title}</span>
            </div>
          </CardHeader>
          {description && <CardDescription className="mb-4">{description}</CardDescription>}
          {children}
          <CardFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  )
}
