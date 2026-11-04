import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar />
      <div className="flex-1 min-w-0 lg:pl-0 transition-all duration-300">
        <Header />
        <main className="p-4 lg:p-6 pb-8">
          <Outlet context={{ layout: 'default' }} />
        </main>
      </div>
    </div>
  )
}
