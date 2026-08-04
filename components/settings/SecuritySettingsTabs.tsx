'use client'

import { Wallet, WalletCards, Shield } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClientAccountPasswordSettings } from './ClientAccountPasswordSettings'
import { PaymentPasswordSettings } from './PaymentPasswordSettings'
import { DataProtectionSettings } from './DataProtectionSettings'

interface SecuritySettingsTabsProps {
  defaultTab?: string
  hasClientAccountPassword: boolean
  hasPaymentPassword: boolean
  hasDeletionPassword: boolean
}

const SECURITY_TABS = ['payments', 'client-account', 'data-deletion']

export function SecuritySettingsTabs({
  defaultTab,
  hasClientAccountPassword,
  hasPaymentPassword,
  hasDeletionPassword,
}: SecuritySettingsTabsProps) {
  const activeTab = defaultTab && SECURITY_TABS.includes(defaultTab) ? defaultTab : 'payments'
  return (
    <Tabs defaultValue={activeTab} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-card">
        <TabsTrigger value="payments" className="shrink-0 gap-2">
          <WalletCards className="h-4 w-4" />
          Payments
        </TabsTrigger>
        <TabsTrigger value="client-account" className="shrink-0 gap-2">
          <Wallet className="h-4 w-4" />
          Client Account
        </TabsTrigger>
        <TabsTrigger value="data-deletion" className="shrink-0 gap-2">
          <Shield className="h-4 w-4" />
          Data Deletion
        </TabsTrigger>
      </TabsList>

      <TabsContent value="payments" className="space-y-6">
        <PaymentPasswordSettings hasPassword={hasPaymentPassword} />
      </TabsContent>

      <TabsContent value="client-account" className="space-y-6">
        <ClientAccountPasswordSettings hasPassword={hasClientAccountPassword} />
      </TabsContent>

      <TabsContent value="data-deletion" className="space-y-6">
        <DataProtectionSettings hasPassword={hasDeletionPassword} />
      </TabsContent>
    </Tabs>
  )
}
