'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateUserDetails } from '@/lib/actions/settings'
import { changePassword } from '@/lib/actions/auth'
import { playSuccessSound, playErrorSound } from '@/lib/sound'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardFooter } from '@/components/ui/card'
import { SettingsSection, Subsection } from './SettingsSection'
import { TwoFactorSettings } from './TwoFactorSettings'

interface UserDetailsFormProps {
  profile?: {
    id?: string | null
    email?: string | null
    full_name?: string | null
    phone?: string | null
    employee_number?: string | null
    date_of_birth?: string | null
    id_security_number?: string | null
    job_title?: string | null
    department?: string | null
  } | null
}

export function UserDetailsForm({ profile }: UserDetailsFormProps) {
  const router = useRouter()
  const [profileLoading, setProfileLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setProfileLoading(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await updateUserDetails(formData)
      if (result?.error) {
        playErrorSound()
        toast.error('Unable to save user details', {
          description: result.error,
        })
      } else if (result?.success) {
        playSuccessSound()
        toast.success('User details saved', {
          description: 'Your profile has been updated.',
        })
        router.refresh()
      } else {
        playErrorSound()
        toast.error('Unable to save user details', {
          description: 'Unexpected response from server. Please try again.',
        })
      }
    } catch (err) {
      console.error('User details form submit error:', err)
      playErrorSound()
      toast.error('Something went wrong while saving. Please try again.')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordLoading(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await changePassword(formData)
      if (result?.error) {
        playErrorSound()
        toast.error('Unable to change password', {
          description: result.error,
        })
      } else if (result?.success) {
        playSuccessSound()
        toast.success('Password changed', {
          description: 'Your password has been updated.',
        })
        e.currentTarget.reset()
        router.refresh()
      } else {
        playErrorSound()
        toast.error('Unable to change password', {
          description: 'Unexpected response from server. Please try again.',
        })
      }
    } catch (err) {
      console.error('Password change form submit error:', err)
      playErrorSound()
      toast.error('Something went wrong while changing your password. Please try again.')
    } finally {
      setPasswordLoading(false)
    }
  }

  const profileFormKey = JSON.stringify([
    profile?.email,
    profile?.full_name,
    profile?.phone,
    profile?.employee_number,
    profile?.date_of_birth,
    profile?.id_security_number,
    profile?.job_title,
    profile?.department,
  ])

  return (
    <div className="space-y-6">
      <form onSubmit={handleProfileSubmit} className="space-y-6" key={profileFormKey}>
        <SettingsSection
          title="User profile"
          description="Your personal and employment details. Only you and admins can edit this."
        >
          <div className="space-y-8">
            <Subsection title="Personal" description="Name, email and contact number.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input id="full_name" name="full_name" defaultValue={profile?.full_name || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_email">Email</Label>
                  <Input
                    id="user_email"
                    name="user_email"
                    type="email"
                    defaultValue={profile?.email || ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    A confirmation link may be sent to the new address before the change takes effect.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone_user">Phone</Label>
                  <Input
                    id="phone_user"
                    name="phone_user"
                    type="tel"
                    inputMode="tel"
                    defaultValue={profile?.phone || ''}
                    placeholder="07496 185 969"
                    onChange={(e) => {
                      e.target.value = e.target.value.replace(/[^+\d\s()-]/g, '')
                    }}
                  />
                  <p className="text-xs text-gray-500">UK phone number, e.g. 07496 185 969.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date_of_birth">Date of Birth</Label>
                  <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={profile?.date_of_birth || ''} />
                </div>
              </div>
            </Subsection>

            <Subsection title="Employment" description="Employee number, role and department.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employee_number">Employee Number</Label>
                  <Input id="employee_number" name="employee_number" defaultValue={profile?.employee_number || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="id_security_number">ID / Security Number</Label>
                  <Input id="id_security_number" name="id_security_number" defaultValue={profile?.id_security_number || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job_title">Job Title</Label>
                  <Input id="job_title" name="job_title" defaultValue={profile?.job_title || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" name="department" defaultValue={profile?.department || ''} />
                </div>
              </div>
            </Subsection>
          </div>
        </SettingsSection>

        <Card>
          <CardFooter className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-gray-500">
              Changes apply to your user profile.
            </p>
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : 'Save User Details'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <form onSubmit={handlePasswordSubmit} className="space-y-6">
        <SettingsSection
          title="Security"
          description="Change the password you use to sign in to the dashboard."
        >
          <Subsection title="Password" description="Choose a strong password that you do not use elsewhere.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="current_password">Current Password</Label>
                <Input
                  id="current_password"
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters. We recommend 12 or more with a mix of letters, numbers and symbols.
            </p>
          </Subsection>
        </SettingsSection>

        <Card>
          <CardFooter className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-gray-500">
              You will stay signed in after changing your password.
            </p>
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Changing...' : 'Change Password'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <TwoFactorSettings />
    </div>
  )
}
