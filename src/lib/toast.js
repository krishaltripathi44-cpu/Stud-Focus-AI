import { toast } from 'sonner'

export function showToast({ type = 'success', title, description }) {
  if (type === 'success') toast.success(title, { description })
  else if (type === 'error') toast.error(title, { description })
  else if (type === 'info') toast.info(title, { description })
  else toast(title, { description })
}
