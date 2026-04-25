'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SessionProvider } from '@/components/SessionProvider'
import { SessionTimer } from '@/components/SessionTimer'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

// PIN gate shown to staff users before accessing admin
function AdminPinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const router = useRouter()

  const handleKey = (key: string) => {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (!key || pin.length >= 8) return
    const next = pin + key
    setPin(next)
    setError('')
    if (next.length >= 4) setTimeout(() => attemptVerify(next), 150)
  }

  const attemptVerify = async (code: string) => {
    if (code.length < 4) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/admin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      })
      if (res.ok) {
        onSuccess()
      } else {
        setError('Incorrect supervisor PIN')
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 500)
      }
    } catch {
      setError('Connection error')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 select-none">
      <div className="mb-10 text-center">
        <h1
          className="text-4xl font-black tracking-tight text-white mb-1"
          style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', borderRadius: '16px' }}
        >
          ADMIN ACCESS
        </h1>
        <p className="text-zinc-500 text-sm tracking-widest uppercase">Enter supervisor PIN</p>
      </div>

      {/* PIN dots */}
      <div
        className="flex gap-5 mb-3 h-14 items-center justify-center"
        style={shake ? { animation: 'shake 0.4s ease-in-out' } : {}}
      >
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-150"
            style={i < pin.length
              ? { width: '28px', height: '28px', backgroundColor: '#fbbf24' }
              : { width: '20px', height: '20px', backgroundColor: '#3f3f46' }
            }
          />
        ))}
      </div>

      <div className="h-5 mb-6">
        {error && <p className="text-red-400 text-sm font-medium text-center">{error}</p>}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-4 mb-8" style={{ width: '260px', borderRadius: '16px' }}>
        {KEYS.map((key, i) => {
          if (!key) return <div key={i} style={{ width: '72px', height: '72px', borderRadius: '16px' }} />
          return (
            <button
              key={i}
              onClick={() => handleKey(key)}
              disabled={loading}
              style={{ width: '72px', height: '72px', color: key === '⌫' ? '#a1a1aa' : 'white', borderRadius: '16px', fontSize: '30px' }}
              className={`
                rounded-full text-3xl font-semibold
                flex items-center justify-center mx-auto
                transition-all duration-100 active:scale-90
                ${key === '⌫'
                  ? 'bg-transparent hover:bg-zinc-800/60'
                  : 'bg-zinc-800 hover:shadow-[0_0_0_4px_rgba(251,191,36,0.25)] hover:bg-zinc-700 active:bg-zinc-600'
                }
                ${loading ? 'opacity-40' : ''}
              `}
            >
              {key}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => router.push('/orders')}
        className="text-zinc-500 text-sm underline"
      >
        ← Back to orders
      </button>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}

function AdminPageContent() {
  const router = useRouter()
  const [settings, setSettings] = useState({
    bin_location_metafield_key: 'custom.bin_name',
    max_batch_size: 12,
  })
  const [staffPin, setStaffPin] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [pinGatePassed, setPinGatePassed] = useState(false)

  // User management
  const [users, setUsers] = useState<{ id: string; name: string; role: string; active: boolean }[]>([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState<'staff' | 'admin'>('staff')
  const [newUserPin, setNewUserPin] = useState('')
  const [editingPin, setEditingPin] = useState<{ id: string; pin: string } | null>(null)
  const [userError, setUserError] = useState('')

  const fetchUsers = () => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { if (d.users) setUsers(d.users) })
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/auth/refresh')
      .then(r => r.json())
      .then(d => {
        if (!d.valid) { router.push('/login'); return }
        setRole(d.role)
        // Admin users pass gate automatically
        if (d.role === 'admin') setPinGatePassed(true)
        setLoading(false)
      })
      .catch(() => router.push('/login'))
  }, [router])

  useEffect(() => {
    if (!pinGatePassed) return
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (d.settings) setSettings(d.settings) })
      .catch(() => {})
    fetchUsers()
  }, [pinGatePassed])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    const body: Record<string, unknown> = {
      bin_location_metafield_key: settings.bin_location_metafield_key,
      max_batch_size: settings.max_batch_size,
    }
    if (staffPin) body.staff_pin = staffPin
    if (adminPin) body.admin_pin = adminPin
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Settings saved successfully')
      setStaffPin('')
      setAdminPin('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('All pick data cleared — ready for fresh test run')
      setShowResetConfirm(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }

  // Staff user needs to pass PIN gate
  if (!pinGatePassed) {
    return <AdminPinGate onSuccess={() => setPinGatePassed(true)} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pb-4 pt-safe flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/orders')}
            style={{ width: '48px', height: '48px', fontSize: '30px', borderRadius: '16px' }}
          >←</button>
          <h1
            className="text-2xl font-black text-white tracking-tight"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', borderRadius: '16px', fontSize: '24px' }}
          >
            ADMIN SETTINGS
          </h1>
        </div>
        <SessionTimer />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-10">
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-2xl px-4 py-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950 border border-green-800 rounded-2xl px-4 py-3 mb-4 text-green-400 text-sm">
            ✓ {success}
          </div>
        )}

        {/* PIN settings */}
        <section className="mb-6">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
            PIN Configuration
          </h2>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">New Staff PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={staffPin}
                onChange={e => setStaffPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4–8 digits (leave blank to keep current)"
                maxLength={8}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-3 focus:outline-none focus:border-amber-400 text-base" style={{ fontSize: '16px' }}
              />
            </div>
            <div className="p-4">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">New Admin/Supervisor PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={adminPin}
                onChange={e => setAdminPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4–8 digits (leave blank to keep current)"
                maxLength={8}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-3 focus:outline-none focus:border-amber-400 text-base"
              />
            </div>
          </div>
        </section>

        {/* Pick settings */}
        <section className="mb-6">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
            Pick Settings
          </h2>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Maximum Batch Size</label>
              <input
                type="number"
                inputMode="numeric"
                value={settings.max_batch_size}
                onChange={e => setSettings(s => ({ ...s, max_batch_size: parseInt(e.target.value) || 12 }))}
                min={1}
                max={50}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-3 focus:outline-none focus:border-amber-400 text-base"
              />
              <p className="text-zinc-600 text-xs mt-1">Max orders per pick run (1–50)</p>
            </div>
            <div className="p-4">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Bin Location Metafield Key</label>
              <input
                type="text"
                value={settings.bin_location_metafield_key}
                onChange={e => setSettings(s => ({ ...s, bin_location_metafield_key: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-3 focus:outline-none focus:border-amber-400 text-base font-mono"
              />
              <p className="text-zinc-600 text-xs mt-1">Shopify variant metafield (namespace.key)</p>
            </div>
          </div>
        </section>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl font-black text-lg active:scale-[0.98] transition-all disabled:opacity-50 mb-8"
          style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', borderRadius: '16px', fontSize: '18px', backgroundColor: '#fbbf24', color: 'black', padding: '16px 0' }}
        >
          {saving ? 'Saving…' : 'SAVE SETTINGS'}
        </button>

        {/* ── User Management ── */}
        <section className="mb-6">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
            Pickers & Users
          </h2>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden mb-3">
            {users.length === 0 && (
              <p style={{ fontSize: '14px', color: '#71717a', padding: '16px' }}>No users found</p>
            )}
            {users.map((u, i) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-4"
                style={{ paddingTop: '12px', paddingBottom: '12px', borderBottom: i < users.length - 1 ? '1px solid #27272a' : 'none' }}
              >
                <div>
                  <p style={{ fontSize: '16px', color: u.active ? 'white' : '#52525b', fontWeight: 'bold' }}>{u.name}</p>
                  <p style={{ fontSize: '12px', color: u.role === 'admin' ? '#fbbf24' : '#71717a', textTransform: 'capitalize' }}>{u.role}{!u.active ? ' · Inactive' : ''}</p>
                </div>
                <div className="flex gap-2">
                  {/* Change PIN */}
                  {editingPin?.id === u.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="password"
                        inputMode="numeric"
                        placeholder="New PIN"
                        value={editingPin.pin}
                        onChange={e => setEditingPin({ id: u.id, pin: e.target.value.replace(/\D/g, '') })}
                        maxLength={8}
                        style={{ width: '100px', fontSize: '14px', borderRadius: '8px', backgroundColor: '#27272a', color: 'white', border: '1px solid #3f3f46', padding: '6px 10px' }}
                      />
                      <button
                        onClick={async () => {
                          if (editingPin.pin.length < 4) { setUserError('PIN must be 4+ digits'); return }
                          await fetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: editingPin.pin }) })
                          setEditingPin(null); setUserError(''); fetchUsers()
                        }}
                        style={{ fontSize: '14px', color: '#4ade80', backgroundColor: 'transparent', border: 'none', padding: '6px' }}
                      >✓</button>
                      <button onClick={() => setEditingPin(null)} style={{ fontSize: '14px', color: '#71717a', backgroundColor: 'transparent', border: 'none', padding: '6px' }}>✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingPin({ id: u.id, pin: '' })}
                      style={{ fontSize: '12px', color: '#a1a1aa', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px', padding: '6px 10px' }}
                    >Change PIN</button>
                  )}
                  {/* Activate/Deactivate */}
                  <button
                    onClick={async () => {
                      await fetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !u.active }) })
                      fetchUsers()
                    }}
                    style={{ fontSize: '12px', color: u.active ? '#f87171' : '#4ade80', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px', padding: '6px 10px' }}
                  >{u.active ? 'Deactivate' : 'Activate'}</button>
                </div>
              </div>
            ))}
          </div>

          {userError && <p style={{ fontSize: '13px', color: '#f87171', marginBottom: '8px' }}>{userError}</p>}

          {showAddUser ? (
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 space-y-3">
              <p style={{ fontSize: '14px', color: '#a1a1aa', fontWeight: 'bold' }}>Add New User</p>
              <input
                type="text"
                placeholder="Name"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                style={{ width: '100%', fontSize: '16px', borderRadius: '12px', backgroundColor: '#27272a', color: 'white', border: '1px solid #3f3f46', padding: '10px 14px', boxSizing: 'border-box' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setNewUserRole('staff')}
                  style={{ flex: 1, height: '40px', fontSize: '14px', borderRadius: '10px', backgroundColor: newUserRole === 'staff' ? 'rgba(251,191,36,0.2)' : '#27272a', color: newUserRole === 'staff' ? '#fbbf24' : '#a1a1aa', border: newUserRole === 'staff' ? '1px solid #fbbf24' : '1px solid #3f3f46' }}
                >Staff</button>
                <button
                  onClick={() => setNewUserRole('admin')}
                  style={{ flex: 1, height: '40px', fontSize: '14px', borderRadius: '10px', backgroundColor: newUserRole === 'admin' ? 'rgba(251,191,36,0.2)' : '#27272a', color: newUserRole === 'admin' ? '#fbbf24' : '#a1a1aa', border: newUserRole === 'admin' ? '1px solid #fbbf24' : '1px solid #3f3f46' }}
                >Admin</button>
              </div>
              <input
                type="password"
                inputMode="numeric"
                placeholder="PIN (4–8 digits)"
                value={newUserPin}
                onChange={e => setNewUserPin(e.target.value.replace(/\D/g, ''))}
                maxLength={8}
                style={{ width: '100%', fontSize: '16px', borderRadius: '12px', backgroundColor: '#27272a', color: 'white', border: '1px solid #3f3f46', padding: '10px 14px', boxSizing: 'border-box' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddUser(false); setNewUserName(''); setNewUserPin(''); setUserError('') }}
                  style={{ flex: 1, height: '44px', fontSize: '15px', borderRadius: '12px', backgroundColor: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46' }}
                >Cancel</button>
                <button
                  onClick={async () => {
                    if (!newUserName.trim()) { setUserError('Name required'); return }
                    if (newUserPin.length < 4) { setUserError('PIN must be 4+ digits'); return }
                    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newUserName.trim(), role: newUserRole, pin: newUserPin }) })
                    if (res.ok) { setShowAddUser(false); setNewUserName(''); setNewUserPin(''); setUserError(''); fetchUsers() }
                    else { const d = await res.json(); setUserError(d.error || 'Failed to add user') }
                  }}
                  style={{ flex: 1, height: '44px', fontSize: '15px', fontWeight: 'bold', borderRadius: '12px', backgroundColor: '#fbbf24', color: 'black' }}
                >Add User</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddUser(true)}
              style={{ width: '100%', height: '48px', fontSize: '16px', borderRadius: '16px', backgroundColor: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46' }}
              className="active:scale-95 transition-all"
            >+ Add Picker / User</button>
          )}
        </section>

        {/* ── Dev / Testing Reset ── */}
        <section className="mb-6">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
            Development & Testing
          </h2>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 space-y-3">

            {/* Reset all pick data */}
            <div>
              <p className="text-zinc-300 text-sm font-semibold mb-1">Reset All Pick Data</p>
              <p className="text-zinc-500 text-sm mb-3">
                Clears all pick runs, order assignments, confirmations, and parked orders.
                Use this to release orders back to the queue for re-testing.
              </p>
              {!showResetConfirm ? (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full border border-red-800 text-red-400 rounded-2xl font-semibold text-3xl active:scale-[0.98] active:bg-red-950 transition-all"
                  style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
                >
                  Reset Pick Data…
                </button>
              ) : (
                <div className="bg-red-950/50 border border-red-800 rounded-2xl p-4">
                  <p className="text-red-400 font-bold text-base mb-1">⚠ Are you sure?</p>
                  <p className="text-red-400/70 text-sm mb-4">
                    This will permanently delete all pick runs and release all orders.
                    This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 bg-zinc-800 text-zinc-300 rounded-2xl font-semibold text-3xl active:scale-[0.98] transition-all"
                      style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReset}
                      disabled={resetting}
                      className="flex-1 bg-red-600 text-white rounded-2xl font-bold text-3xl active:scale-[0.98] transition-all disabled:opacity-50"
                      style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
                    >
                      {resetting ? 'Clearing…' : 'Yes, Reset'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-zinc-800" />

            {/* Cancel current pick session */}
            <div>
              <p className="text-zinc-300 text-sm font-semibold mb-1">Cancel Current Pick Session</p>
              <p className="text-zinc-500 text-sm mb-3">
                Marks the active pick run for this session as abandoned without clearing all data.
              </p>
              <button
                onClick={async () => {
                  sessionStorage.removeItem('pickRunId')
                  sessionStorage.removeItem('selectedOrders')
                  sessionStorage.removeItem('toteAssignments')
                  sessionStorage.removeItem('orderIds')
                  sessionStorage.removeItem('parkedOrderIds')
                  setSuccess('Pick session cleared — orders released')
                }}
                className="w-full border border-amber-800 text-amber-400 rounded-2xl font-semibold text-3xl active:scale-[0.98] active:bg-amber-950 transition-all"
                style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
              >
                Cancel Pick Session
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-zinc-800" />

            {/* Log out */}
            <div>
              <p className="text-zinc-300 text-sm font-semibold mb-1">Log Out</p>
              <p className="text-zinc-500 text-sm mb-3">
                Clears your session cookie and returns to the PIN login screen.
              </p>
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' })
                  sessionStorage.clear()
                  router.push('/login')
                }}
                className="w-full border border-zinc-600 text-zinc-300 rounded-2xl font-semibold text-3xl active:scale-[0.98] active:bg-zinc-800 transition-all"
                style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
              >
                Log Out
              </button>
            </div>

          </div>
        </section>

        {/* App info */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">App Info</h2>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Version</span>
              <span className="text-zinc-300">1.0.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Role</span>
              <span className="text-zinc-300 capitalize">{role}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <SessionProvider>
      <AdminPageContent />
    </SessionProvider>
  )
}
