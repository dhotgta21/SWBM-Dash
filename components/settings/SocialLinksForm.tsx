'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { updateSocialLinks } from '@/lib/actions/social'
import { playSuccessSound, playErrorSound } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardFooter } from '@/components/ui/card'
import { SettingsSection } from './SettingsSection'
import { SocialLinkEditor } from './SocialLinkEditor'

interface SocialLinksFormProps {
  initialRaw?: string | null
  canEdit?: boolean
}

export function SocialLinksForm({ initialRaw, canEdit = true }: SocialLinksFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await updateSocialLinks(formData)

      if (result?.error) {
        playErrorSound()
        setError(result.error)
        toast.error('Unable to save social media links', {
          description: result.error,
        })
      } else if (result?.success) {
        playSuccessSound()
        setSuccess(true)
        toast.success('Social media links saved')
        router.refresh()
      } else {
        playErrorSound()
        setError('Unexpected response from server. Please try again.')
        toast.error('Unable to save social media links')
      }
    } catch (err) {
      console.error('Social links form submit error:', err)
      playErrorSound()
      const message = err instanceof Error ? err.message : 'Something went wrong while saving.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      key={initialRaw ?? 'empty'}
    >
      <input type="hidden" name="id" value={1} readOnly />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>Social media links saved.</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={!canEdit || loading} className="space-y-6">
        <SettingsSection
          title="Social media links"
          description="One row per platform. Fill in the profile URL for each network you use — the ones you set will automatically appear in the site footer and feed into Google’s LocalBusiness structured data so Google can verify the business for local results."
        >
          <SocialLinkEditor initialRaw={initialRaw ?? null} disabled={!canEdit || loading} />
        </SettingsSection>
      </fieldset>

      {canEdit && (
        <Card>
          <CardFooter className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
            <p className="text-sm text-gray-500">
              Changes apply to the site footer and Google LocalBusiness structured data.
            </p>
            <Button type="submit" disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              {loading ? 'Saving…' : 'Save social links'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  )
}

export default SocialLinksForm
