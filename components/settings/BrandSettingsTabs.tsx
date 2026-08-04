'use client'

import { Palette, Info, Share2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppearanceForm } from './AppearanceForm'
import {
  AboutSettingsSection,
  TeamSettingsSection,
  HistorySettingsSection,
  YardSectionsSettingsSection,
} from './AboutSettings'
import { SocialLinksForm } from './SocialLinksForm'
import type { AppearanceSettings } from '@/lib/appearance-shared'
import type { TeamMemberRow, HistoryMilestoneRow } from '@/lib/actions/about'

interface BrandSettingsTabsProps {
  defaultTab?: string
  appearanceSettings: AppearanceSettings | null
  logoUrl?: string | null
  logoUpdatedAt?: string | null
  canEdit?: boolean
  seoSameAs?: string | null
  company: {
    id: number
    founded_year: number | null
    fleet_size: number | null
    yard_description: string | null
    opening_hours_text: string | null
  }
  teamMembers: TeamMemberRow[]
  historyMilestones: HistoryMilestoneRow[]
  yardSections: Array<{ name: string; icon: string; blurb: string }>
}

const BRAND_TABS = ['appearance', 'about', 'social']

export function BrandSettingsTabs({
  defaultTab,
  appearanceSettings,
  logoUrl,
  logoUpdatedAt,
  canEdit,
  seoSameAs,
  company,
  teamMembers,
  historyMilestones,
  yardSections,
}: BrandSettingsTabsProps) {
  const activeTab = defaultTab && BRAND_TABS.includes(defaultTab) ? defaultTab : 'appearance'
  return (
    <Tabs defaultValue={activeTab} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-card">
        <TabsTrigger value="appearance" className="shrink-0 gap-2">
          <Palette className="h-4 w-4" />
          Appearance
        </TabsTrigger>
        <TabsTrigger value="about" className="shrink-0 gap-2">
          <Info className="h-4 w-4" />
          About page
        </TabsTrigger>
        <TabsTrigger value="social" className="shrink-0 gap-2">
          <Share2 className="h-4 w-4" />
          Social media
        </TabsTrigger>
      </TabsList>

      <TabsContent value="appearance" className="space-y-6">
        <AppearanceForm
          key={appearanceSettings ? JSON.stringify(appearanceSettings) : 'default'}
          initial={appearanceSettings}
          logoUrl={logoUrl}
          logoUpdatedAt={logoUpdatedAt}
          canEdit={canEdit}
        />
      </TabsContent>

      <TabsContent value="about" className="space-y-6">
        <AboutSettingsSection company={company} />
        <TeamSettingsSection initialMembers={teamMembers} />
        <HistorySettingsSection initialMilestones={historyMilestones} />
        <YardSectionsSettingsSection initialSections={yardSections} />
      </TabsContent>

      <TabsContent value="social" className="space-y-6">
        <SocialLinksForm initialRaw={seoSameAs} canEdit={canEdit} />
      </TabsContent>
    </Tabs>
  )
}
