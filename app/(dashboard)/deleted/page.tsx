import { redirect } from 'next/navigation'

// "Recently deleted" used to live here as a standalone admin page. It now
// lives as the 4th tab on /invoices. Keep this route alive as a redirect
// so any bookmarks, shared links, or in-flight browser tabs land in the
// right place instead of 404ing.
export default function RecentlyDeletedRedirect(): never {
  redirect('/invoices?view=deleted')
}