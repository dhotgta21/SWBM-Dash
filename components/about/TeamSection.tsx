// components/about/TeamSection.tsx
// Public team grid surfaced on the /about page. Renders one card per
// team_member row with a circular photo, name, role and 1-sentence bio.
// Falls back to a friendly "Family-run team" copy when the team table
// is empty so the section never breaks the page.

import Image from 'next/image'
import { Users } from 'lucide-react'
import type { TeamMember } from '@/lib/about/loader'

interface TeamSectionProps {
  members: readonly TeamMember[]
  fallbackTitle?: string
  fallbackBody?: string
}

export function TeamSection({
  members,
  fallbackTitle = 'A family-run team',
  fallbackBody =
    'A small, hands-on team that knows the regulars by name. The same people who load your lorry are the same people who answer the phone.',
}: TeamSectionProps) {
  return (
    <section
      id="team"
      aria-labelledby="team-heading"
      className="scroll-mt-20 border-t border-border bg-card py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px w-10 bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Meet the team
          </span>
        </div>
        <h2
          id="team-heading"
          className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
        >
          The people behind the counter.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {fallbackTitle}. {fallbackBody}
        </p>

        {members.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-border bg-background p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              Team profiles are being added. Check back soon — or call the trade counter to meet the team in person.
            </p>
          </div>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="group flex flex-col items-center rounded-2xl border border-border bg-background p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-primary/30 bg-muted">
                  {member.photoUrl ? (
                    <Image
                      src={member.photoUrl}
                      alt={`${member.name}, ${member.role}`}
                      fill
                      sizes="96px"
                      loading="lazy"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-full w-full items-center justify-center bg-primary/10 text-2xl font-bold text-primary"
                    >
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-lg font-bold tracking-tight text-foreground">
                  {member.name}
                </p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                  {member.role}
                </p>
                {member.bio && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {member.bio}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}