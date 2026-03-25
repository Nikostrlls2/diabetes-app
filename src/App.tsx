import { format, isToday, subDays } from 'date-fns'
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import './App.css'
import { seedFoodCatalog } from './data/foodCatalog'
import { useGlucoStore } from './hooks/useGlucoStore'
import { requestCoachResponse, requestFoodEstimate } from './lib/ai'
import { apiUrl } from './lib/api'
import { downloadCarbCsv, downloadJsonFile, downloadJsonSnapshot } from './lib/export'
import {
  getNativeNotificationPermission,
  listenForNativeReminderEvents,
  requestNativeNotificationPermission,
  supportsNativeNotifications,
  syncNativeReminderNotifications,
} from './lib/nativeNotifications'
import { buildReminderSlot, formatRepeatLabel, getNextReminder, shouldTriggerReminder } from './lib/reminders'
import type { AppTab, FoodEstimateResponse, FoodItem, FoodSource, ReminderKind, ReminderRepeat } from './types'

const tabs: { id: AppTab; label: string }[] = [
  { id: 'start', label: 'Getting Started' },
  { id: 'overview', label: 'Overview' },
  { id: 'foods', label: 'Foods' },
  { id: 'coach', label: 'AI Coach' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'reports', label: 'Reports' },
  { id: 'account', label: 'Account' },
]

const coachPrompts = [
  'How can I plan carbs for a busy school or work day?',
  'What should I pack to treat a low when I leave home?',
  'How can I compare a restaurant meal with my saved foods?',
]

function App() {
  const customFoods = useGlucoStore((s) => s.customFoods)
  const carbEntries = useGlucoStore((s) => s.carbEntries)
  const reminders = useGlucoStore((s) => s.reminders)
  const coachMessages = useGlucoStore((s) => s.coachMessages)
  const glucoseReadings = useGlucoStore((s) => s.glucoseReadings)
  const supplyItems = useGlucoStore((s) => s.supplyItems)
  const settings = useGlucoStore((s) => s.settings)
  const account = useGlucoStore((s) => s.account)
  const consent = useGlucoStore((s) => s.consent)
  const addFood = useGlucoStore((s) => s.addFood)
  const addCarbEntry = useGlucoStore((s) => s.addCarbEntry)
  const addReminder = useGlucoStore((s) => s.addReminder)
  const toggleReminder = useGlucoStore((s) => s.toggleReminder)
  const deleteReminder = useGlucoStore((s) => s.deleteReminder)
  const markReminderFired = useGlucoStore((s) => s.markReminderFired)
  const addCoachMessage = useGlucoStore((s) => s.addCoachMessage)
  const clearCoachMessages = useGlucoStore((s) => s.clearCoachMessages)
  const addGlucoseReading = useGlucoStore((s) => s.addGlucoseReading)
  const toggleSupplyItem = useGlucoStore((s) => s.toggleSupplyItem)
  const resetSupplyItems = useGlucoStore((s) => s.resetSupplyItems)
  const updateSettings = useGlucoStore((s) => s.updateSettings)
  const updateAccount = useGlucoStore((s) => s.updateAccount)
  const updateConsent = useGlucoStore((s) => s.updateConsent)
  const resetAllData = useGlucoStore((s) => s.resetAllData)

  const [tab, setTab] = useState<AppTab>('start')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [apiState, setApiState] = useState({ backendOnline: false, aiConfigured: false })
  const [estimatePending, setEstimatePending] = useState(false)
  const [coachPending, setCoachPending] = useState(false)
  const [estimate, setEstimate] = useState<FoodEstimateResponse | null>(null)
  const [aiNotice, setAiNotice] = useState('')
  const [notify, setNotify] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [toast, setToast] = useState('')
  const [customFood, setCustomFood] = useState({ name: '', serving: '', carbs: '', category: 'Custom', notes: '' })
  const [estimateForm, setEstimateForm] = useState({ foodName: '', serving: '' })
  const [meal, setMeal] = useState<{ foodName: string; serving: string; carbs: string; servings: string; note: string; source: FoodSource }>({ foodName: '', serving: '', carbs: '', servings: '1', note: '', source: 'custom' })
  const [question, setQuestion] = useState('')
  const [reminderForm, setReminderForm] = useState<{ title: string; time: string; repeat: ReminderRepeat; kind: ReminderKind }>({ title: 'Glucose check', time: '08:00', repeat: 'daily', kind: 'glucose' })
  const [glucose, setGlucose] = useState({ value: '', context: 'Before lunch', note: '' })
  const [profileForm, setProfileForm] = useState({ lowTarget: String(settings.lowTarget), highTarget: String(settings.highTarget), quickCarbGrams: String(settings.quickCarbGrams) })
  const [starterForm, setStarterForm] = useState({
    acceptedMedicalDisclaimer: consent.acceptedMedicalDisclaimer ?? false,
    acceptedLocalStorage: consent.acceptedLocalStorage ?? false,
    allowAiSharing: consent.allowAiSharing ?? false,
  })
  const [accountForm, setAccountForm] = useState({
    displayName: account.displayName,
    email: account.email,
    diagnosisYear: account.diagnosisYear,
    therapy: account.therapy,
    notes: account.notes,
  })

  const foods = [...customFoods, ...seedFoodCatalog].filter((food) => {
    if (!deferredQuery.trim()) return true
    const q = deferredQuery.toLowerCase()
    return food.name.toLowerCase().includes(q) || food.category.toLowerCase().includes(q) || food.serving.toLowerCase().includes(q)
  }).slice(0, 12)
  const recentEntries = [...carbEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const todayEntries = carbEntries.filter((entry) => isToday(new Date(entry.createdAt)))
  const todayCarbs = todayEntries.reduce((sum, entry) => sum + entry.carbs * entry.servings, 0)
  const latestGlucose = [...glucoseReadings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const latestAssistantReply = [...coachMessages].reverse().find((message) => message.role === 'assistant')
  const latestUserQuestion = [...coachMessages].reverse().find((message) => message.role === 'user')
  const nextReminder = getNextReminder(reminders)
  const packedItems = supplyItems.filter((item) => item.packed).length

  const weeklyEntries = carbEntries.filter((entry) => new Date(entry.createdAt) >= subDays(new Date(), 7))
  const averageCarbs = weeklyEntries.length ? Math.round(weeklyEntries.reduce((sum, entry) => sum + entry.carbs * entry.servings, 0) / weeklyEntries.length) : 0
  const lowCount = glucoseReadings.filter((item) => item.value < settings.lowTarget).length
  const highCount = glucoseReadings.filter((item) => item.value > settings.highTarget).length
  const activeTab = consent.completedGettingStarted ? tab : 'start'
  const visibleTabs = consent.completedGettingStarted ? tabs.filter((item) => item.id !== 'start') : tabs
  const aiBadge = consent.allowAiSharing ? 'AI enabled' : 'Enable AI'
  const aiSetupLabel = apiState.aiConfigured ? 'Built in + desktop backup' : 'Built in'

  useEffect(() => {
    let cancelled = false
    let retryId = 0
    let controller: AbortController | null = null

    const checkHealth = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const response = await fetch(apiUrl('/api/health'), { signal: controller.signal })
        if (!response.ok) {
          throw new Error('Health check failed')
        }

        const data = await response.json()

        if (!cancelled) {
          setApiState({ backendOnline: true, aiConfigured: Boolean(data.aiConfigured) })
        }
      } catch {
        if (!cancelled) {
          setApiState({ backendOnline: false, aiConfigured: false })

          if (window.location.protocol === 'file:') {
            retryId = window.setTimeout(() => {
              void checkHealth()
            }, 1500)
          }
        }
      }
    }

    void checkHealth()

    return () => {
      cancelled = true
      controller?.abort()
      if (retryId) {
        window.clearTimeout(retryId)
      }
    }
  }, [])

  useEffect(() => {
    if (supportsNativeNotifications()) {
      void getNativeNotificationPermission().then(setNotify)
      return
    }

    setNotify(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  }, [])

  useEffect(() => {
    setProfileForm({
      lowTarget: String(settings.lowTarget),
      highTarget: String(settings.highTarget),
      quickCarbGrams: String(settings.quickCarbGrams),
    })
  }, [settings])

  useEffect(() => {
    if (consent.completedGettingStarted && tab === 'start') {
      setTab('overview')
    }
  }, [consent.completedGettingStarted, tab])

  useEffect(() => {
    setStarterForm({
      acceptedMedicalDisclaimer: consent.acceptedMedicalDisclaimer ?? false,
      acceptedLocalStorage: consent.acceptedLocalStorage ?? false,
      allowAiSharing: consent.allowAiSharing ?? false,
    })
  }, [consent])

  useEffect(() => {
    setAccountForm({
      displayName: account.displayName,
      email: account.email,
      diagnosisYear: account.diagnosisYear,
      therapy: account.therapy,
      notes: account.notes,
    })
  }, [account])

  const triggerReminder = useEffectEvent((reminder: (typeof reminders)[number]) => {
    markReminderFired(reminder.id, buildReminderSlot(new Date(), reminder.time))
    setToast(`${reminder.title} at ${reminder.time}`)
    window.setTimeout(() => setToast(''), 4500)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('GlucoPilot reminder', { body: `${reminder.title} at ${reminder.time}` })
  })

  useEffect(() => {
    if (supportsNativeNotifications()) {
      return
    }

    const check = () => {
      const now = new Date()
      reminders.filter((reminder) => shouldTriggerReminder(reminder, now)).forEach(triggerReminder)
    }
    check()
    const id = window.setInterval(check, 30000)
    return () => window.clearInterval(id)
  }, [reminders])

  useEffect(() => {
    if (!supportsNativeNotifications()) {
      return
    }

    void syncNativeReminderNotifications(reminders)
  }, [reminders, notify])

  useEffect(() => {
    let cleanup: (() => void) | null = null

    if (!supportsNativeNotifications()) {
      return
    }

    void listenForNativeReminderEvents((message) => {
      setToast(message)
      window.setTimeout(() => setToast(''), 4500)
    }).then((remove) => {
      cleanup = remove
    })

    return () => {
      if (cleanup) {
        cleanup()
      }
    }
  }, [])

  function fillMeal(food: FoodItem) {
    setMeal({ foodName: food.name, serving: food.serving, carbs: String(food.carbs), servings: '1', note: food.notes ?? '', source: food.source })
  }

  function saveCustomFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const carbs = Number(customFood.carbs)
    if (!customFood.name.trim() || !customFood.serving.trim() || !Number.isFinite(carbs) || carbs < 0) return
    const food = addFood({ ...customFood, carbs, source: 'custom' })
    fillMeal(food)
    setCustomFood({ name: '', serving: '', carbs: '', category: 'Custom', notes: '' })
    setToast('Custom food saved')
  }

  async function estimateFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!estimateForm.foodName.trim()) return
    setEstimatePending(true)
    try {
      const data = await requestFoodEstimate({
        foodName: estimateForm.foodName.trim(),
        serving: estimateForm.serving.trim(),
        backendAvailable: apiState.backendOnline,
        allowAiSharing: consent.allowAiSharing,
      })
      setEstimate(data)
      setAiNotice(data.warning ?? '')
      setMeal({ foodName: data.name, serving: data.serving, carbs: String(data.carbs), servings: '1', note: data.note, source: data.source === 'reference' ? 'seed' : 'ai' })
      setToast(data.source === 'openrouter' ? 'AI estimate ready' : 'Fallback estimate used')
    } catch {
      setAiNotice('The AI estimate could not be loaded right now.')
      setToast('Estimate failed')
    } finally {
      setEstimatePending(false)
    }
  }

  function saveEstimate() {
    if (!estimate) return
    addFood({ name: estimate.name, serving: estimate.serving, carbs: estimate.carbs, category: estimate.category, notes: estimate.note, source: 'ai' })
    setToast('Estimate saved to foods')
  }

  function logMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const carbs = Number(meal.carbs)
    const servings = Number(meal.servings)
    if (!meal.foodName.trim() || !meal.serving.trim() || !Number.isFinite(carbs) || carbs < 0 || !Number.isFinite(servings) || servings <= 0) return
    addCarbEntry({ foodName: meal.foodName, serving: meal.serving, carbs, servings, source: meal.source, note: meal.note.trim() || undefined })
    setMeal((current) => ({ ...current, servings: '1', note: '' }))
    setToast('Meal added to today')
  }

  async function askCoach(text: string) {
    if (!text.trim()) return
    const userMessage = { id: createId(), role: 'user' as const, content: text.trim(), createdAt: new Date().toISOString() }
    startTransition(() => addCoachMessage(userMessage))
    setQuestion('')
    setCoachPending(true)
    try {
      const data = await requestCoachResponse({
        question: userMessage.content,
        summary: buildSummary(todayCarbs, todayEntries.length, reminders.filter((r) => r.enabled).length, latestGlucose),
        backendAvailable: apiState.backendOnline,
        allowAiSharing: consent.allowAiSharing,
      })
      setAiNotice(data.warning ?? '')
      startTransition(() => addCoachMessage({ id: createId(), role: 'assistant', content: data.answer, createdAt: new Date().toISOString() }))
      setToast(data.source === 'openrouter' ? 'AI coach replied' : 'Fallback coach reply used')
    } catch {
      startTransition(() => addCoachMessage({ id: createId(), role: 'assistant', content: 'The AI service is unavailable right now. You can still use food search, reminders, and manual tracking.', createdAt: new Date().toISOString() }))
      setToast('AI request failed')
    } finally {
      setCoachPending(false)
    }
  }

  function saveReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reminderForm.title.trim() || !reminderForm.time.trim()) return
    addReminder({ ...reminderForm, enabled: true })
    setReminderForm({ title: 'Glucose check', time: '08:00', repeat: 'daily', kind: 'glucose' })
    setToast('Reminder saved')
  }

  function saveGlucose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(glucose.value)
    if (!Number.isFinite(value) || value <= 0) return
    addGlucoseReading({ value, context: glucose.context.trim() || 'General note', note: glucose.note.trim() || undefined })
    setGlucose({ value: '', context: 'Before lunch', note: '' })
    setToast('Glucose note saved')
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const lowTarget = Number(profileForm.lowTarget)
    const highTarget = Number(profileForm.highTarget)
    const quickCarbGrams = Number(profileForm.quickCarbGrams)
    if (!Number.isFinite(lowTarget) || !Number.isFinite(highTarget) || !Number.isFinite(quickCarbGrams) || lowTarget <= 0 || highTarget <= lowTarget || quickCarbGrams <= 0) return
    updateSettings({ lowTarget, highTarget, quickCarbGrams })
    setToast('Profile settings saved')
  }

  function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateAccount({
      displayName: accountForm.displayName.trim(),
      email: accountForm.email.trim(),
      diagnosisYear: accountForm.diagnosisYear.trim(),
      therapy: accountForm.therapy.trim(),
      notes: accountForm.notes.trim(),
    })
    setToast('Account profile saved on this device')
  }

  function saveGettingStarted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!starterForm.acceptedMedicalDisclaimer || !starterForm.acceptedLocalStorage) {
      setToast('Accept the safety and privacy checklist before you continue')
      return
    }

    updateConsent({
      ...starterForm,
      completedGettingStarted: true,
    })
    setTab('overview')
    setToast('Getting started saved')
  }

  function clearLocalData() {
    if (!window.confirm('Delete all local foods, glucose notes, reminders, account details, AI settings, and history from this device?')) return
    resetAllData()
    setEstimate(null)
    setAiNotice('')
    setQuestion('')
    setQuery('')
    setTab('start')
    setToast('All local data was removed')
  }

  function reportLatestAiReply() {
    if (!latestAssistantReply) {
      setToast('No AI reply to report yet')
      return
    }

    downloadJsonFile(`glucopilot-ai-report-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      lastUserQuestion: latestUserQuestion?.content ?? null,
      lastAssistantReply: latestAssistantReply.content,
      latestWarning: aiNotice || null,
      appNotice:
        'Send this report to the developer support contact listed in your Play Console or Microsoft Store listing.',
    })
    setToast('AI report downloaded')
  }

  function exportSnapshot() {
    downloadJsonSnapshot({
      exportedAt: new Date().toISOString(),
      foods: customFoods,
      carbEntries,
      reminders,
      glucoseReadings,
      supplyItems,
      settings,
    })
    setToast('JSON export downloaded')
  }

  function exportCsv() {
    downloadCarbCsv(carbEntries)
    setToast('CSV export downloaded')
  }

  async function enableNotifications() {
    if (supportsNativeNotifications()) {
      const next = await requestNativeNotificationPermission()
      setNotify(next)
      if (next === 'granted') {
        await syncNativeReminderNotifications(reminders)
      }
      return
    }

    if (typeof Notification === 'undefined') return setNotify('unsupported')
    setNotify(await Notification.requestPermission())
  }

  return (
    <main className="app">
      <section className="hero card hero-card">
        <div>
          <h1>GlucoPilot</h1>
          <p className="lede">Carb lookup, saved foods, reminders, exports, and educational support for people living with type 1 diabetes.</p>
          <div className="badges"><span>{aiBadge}</span><span>{Math.round(todayCarbs)}g today</span><span>{packedItems}/{supplyItems.length} kit items packed</span></div>
          <p className="legal-note">Not a medical device. Not for diagnosis, emergencies, or insulin dosing decisions.</p>
        </div>
        <div className="stats">
          <article><span>Saved foods</span><strong>{customFoods.length}</strong></article>
          <article><span>Latest glucose</span><strong>{latestGlucose ? `${latestGlucose.value}` : 'None'}</strong></article>
          <article><span>Next reminder</span><strong>{nextReminder ? format(nextReminder.when, 'EEE HH:mm') : 'Not set'}</strong></article>
          <article><span>Weekly average meal carbs</span><strong>{averageCarbs}g</strong></article>
        </div>
      </section>

      <nav className="tabs">{visibleTabs.map((item) => <button key={item.id} className={activeTab === item.id ? 'active' : ''} type="button" onClick={() => setTab(item.id)} disabled={!consent.completedGettingStarted && item.id !== 'start'}>{item.label}</button>)}</nav>
      {aiNotice ? <div className="toast warning">AI notice: {aiNotice}</div> : null}
      {toast ? <div className="toast">{toast}</div> : null}

      {activeTab === 'start' ? <section className="grid section-enter">
        <article className="card wide">
          <h2>Getting Started</h2>
          <p className="muted">Review the safety, privacy, and AI sharing options before you start logging health information on this device.</p>
          <form className="form" onSubmit={saveGettingStarted}>
            <label className="check consent-check">
              <input type="checkbox" checked={starterForm.acceptedMedicalDisclaimer} onChange={(e) => setStarterForm((current) => ({ ...current, acceptedMedicalDisclaimer: e.target.checked }))} />
              <span>I understand this app is for education and organization, not diagnosis, treatment, or insulin dosing.</span>
            </label>
            <label className="check consent-check">
              <input type="checkbox" checked={starterForm.acceptedLocalStorage} onChange={(e) => setStarterForm((current) => ({ ...current, acceptedLocalStorage: e.target.checked }))} />
              <span>I agree that carb logs, glucose notes, reminders, and account details can be stored locally on this device until I delete them.</span>
            </label>
            <label className="check consent-check">
              <input type="checkbox" checked={starterForm.allowAiSharing} onChange={(e) => setStarterForm((current) => ({ ...current, allowAiSharing: e.target.checked }))} />
              <span>I want to enable live AI. When on, food questions and coach prompts may be sent to OpenRouter. Do not include names, addresses, or other private details.</span>
            </label>
            <div className="actions">
              <a className="secondary link-button" href="./privacy.html" target="_blank" rel="noreferrer">Open privacy policy</a>
              <button className="primary" type="submit">{consent.completedGettingStarted ? 'Save changes' : 'Finish setup'}</button>
            </div>
          </form>
        </article>
        <article className="card">
          <h2>Before You Use AI</h2>
          <ul className="tips">
            <li>AI answers are educational only and can be wrong.</li>
            <li>Use your clinician-approved plan for insulin, ketones, and emergencies.</li>
            <li>Use the report button in the AI tab if an answer looks unsafe or inappropriate.</li>
          </ul>
        </article>
        <article className="card">
          <h2>Privacy controls</h2>
          <div className="stats-list">
            <div><span>Local storage consent</span><strong>{consent.acceptedLocalStorage ? 'Accepted' : 'Required'}</strong></div>
            <div><span>Medical disclaimer</span><strong>{consent.acceptedMedicalDisclaimer ? 'Accepted' : 'Required'}</strong></div>
            <div><span>AI sharing</span><strong>{consent.allowAiSharing ? 'Enabled' : 'Off'}</strong></div>
          </div>
          <button className="ghost block" type="button" onClick={clearLocalData}>Delete all local data</button>
        </article>
      </section> : null}

      {activeTab === 'overview' ? <section className="grid section-enter">
        <article className="card wide">
          <h2>Today</h2>
          <div className="list">{recentEntries.length ? recentEntries.map((entry) => <div key={entry.id} className="row"><div><strong>{entry.foodName}</strong><p>{entry.servings} x {entry.serving}</p></div><div><strong>{Math.round(entry.carbs * entry.servings)}g</strong><p>{format(new Date(entry.createdAt), 'HH:mm')}</p></div></div>) : <p className="muted">No carb entries yet.</p>}</div>
        </article>
        <article className="card">
          <h2>Glucose note</h2>
          <form className="form" onSubmit={saveGlucose}>
            <input type="number" min="1" value={glucose.value} onChange={(e) => setGlucose((c) => ({ ...c, value: e.target.value }))} placeholder="Value mg/dL" />
            <input value={glucose.context} onChange={(e) => setGlucose((c) => ({ ...c, context: e.target.value }))} placeholder="Context" />
            <textarea value={glucose.note} onChange={(e) => setGlucose((c) => ({ ...c, note: e.target.value }))} placeholder="Stress, walk, workout, site change..." />
            <button className="primary" type="submit">Save note</button>
          </form>
          {latestGlucose ? <p className={`pill ${classForGlucose(latestGlucose.value, settings.lowTarget, settings.highTarget)}`}>Latest status: {statusForGlucose(latestGlucose.value, settings.lowTarget, settings.highTarget)}</p> : null}
        </article>
        <article className="card wide">
          <h2>Quick support</h2>
          <ul className="tips">
            <li>Fast carb target set to {settings.quickCarbGrams}g. Use your own care plan for treatment decisions.</li>
            <li>Low glucose notes below {settings.lowTarget} and highs above {settings.highTarget} are counted in Reports.</li>
            <li>Use the supply checklist before school, work, travel, or long workouts.</li>
          </ul>
        </article>
      </section> : null}

      {activeTab === 'foods' ? <section className="grid section-enter">
        <article className="card wide">
          <h2>Food library</h2>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search banana, rice, juice, breakfast..." />
          <div className="food-list">{foods.length ? foods.map((food) => <div key={food.id} className="food"><div><strong>{food.name}</strong><p>{food.category} | {food.serving}</p><small>{food.notes}</small></div><div className="food-side"><strong>{food.carbs}g</strong><button className="secondary" type="button" onClick={() => fillMeal(food)}>Log</button></div></div>) : <p className="muted">No matching foods.</p>}</div>
        </article>
        <article className="card">
          <h2>Add custom food</h2>
          <form className="form" onSubmit={saveCustomFood}>
            <input value={customFood.name} onChange={(e) => setCustomFood((c) => ({ ...c, name: e.target.value }))} placeholder="Food name" />
            <input value={customFood.serving} onChange={(e) => setCustomFood((c) => ({ ...c, serving: e.target.value }))} placeholder="Serving" />
            <input type="number" min="0" step="0.1" value={customFood.carbs} onChange={(e) => setCustomFood((c) => ({ ...c, carbs: e.target.value }))} placeholder="Carbs" />
            <input value={customFood.category} onChange={(e) => setCustomFood((c) => ({ ...c, category: e.target.value }))} placeholder="Category" />
            <textarea value={customFood.notes} onChange={(e) => setCustomFood((c) => ({ ...c, notes: e.target.value }))} placeholder="Notes" />
            <button className="primary" type="submit">Save food</button>
          </form>
        </article>
        <article className="card">
          <h2>AI carb estimate</h2>
          <p className="muted">Educational estimate only. Not for insulin dosing. Live AI only runs if AI sharing is enabled in Getting Started or Account.</p>
          <form className="form" onSubmit={estimateFood}>
            <input value={estimateForm.foodName} onChange={(e) => setEstimateForm((c) => ({ ...c, foodName: e.target.value }))} placeholder="Food name" />
            <input value={estimateForm.serving} onChange={(e) => setEstimateForm((c) => ({ ...c, serving: e.target.value }))} placeholder="Serving size" />
            <button className="primary" type="submit" disabled={estimatePending}>{estimatePending ? 'Estimating...' : 'Estimate'}</button>
          </form>
          {estimate ? <div className="estimate"><strong>{estimate.name}</strong><p>{estimate.serving} | {estimate.category}</p><p>{estimate.carbs}g carbs</p><small>{estimate.note}</small><button className="secondary block" type="button" onClick={saveEstimate}>Save estimate</button></div> : null}
        </article>
        <article className="card wide">
          <h2>Meal log</h2>
          <form className="meal-grid" onSubmit={logMeal}>
            <input value={meal.foodName} onChange={(e) => setMeal((c) => ({ ...c, foodName: e.target.value }))} placeholder="Food" />
            <input value={meal.serving} onChange={(e) => setMeal((c) => ({ ...c, serving: e.target.value }))} placeholder="Serving" />
            <input type="number" min="0" step="0.1" value={meal.carbs} onChange={(e) => setMeal((c) => ({ ...c, carbs: e.target.value }))} placeholder="Carbs / serving" />
            <input type="number" min="0.25" step="0.25" value={meal.servings} onChange={(e) => setMeal((c) => ({ ...c, servings: e.target.value }))} placeholder="Servings eaten" />
            <textarea value={meal.note} onChange={(e) => setMeal((c) => ({ ...c, note: e.target.value }))} placeholder="Note" />
            <button className="primary" type="submit">Add to today</button>
          </form>
        </article>
      </section> : null}

      {activeTab === 'coach' ? <section className="grid section-enter">
        <article className="card wide">
          <h2>AI coach</h2>
          <p className="muted">Educational only. Do not use AI output for insulin dosing or emergency decisions.</p>
          <div className="chips">{coachPrompts.map((prompt) => <button key={prompt} className="secondary" type="button" onClick={() => void askCoach(prompt)}>{prompt}</button>)}</div>
          <div className="chat">{coachMessages.map((message) => <div key={message.id} className={`bubble ${message.role}`}><strong>{message.role === 'user' ? 'You' : 'Coach'}</strong><p>{message.content}</p><small>{format(new Date(message.createdAt), 'MMM d, HH:mm')}</small></div>)}{coachPending ? <div className="bubble assistant"><strong>Coach</strong><p>Thinking...</p></div> : null}</div>
        </article>
        <article className="card">
          <h2>Ask</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void askCoach(question) }}>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about meal planning, reminders, preparation, routines, or carb-heavy foods." />
            <button className="primary" type="submit" disabled={coachPending}>{coachPending ? 'Sending...' : 'Ask coach'}</button>
          </form>
          <button className="secondary block" type="button" onClick={reportLatestAiReply}>Report last AI reply</button>
          <button className="secondary block" type="button" onClick={clearCoachMessages}>Clear conversation</button>
        </article>
      </section> : null}

      {activeTab === 'reminders' ? <section className="grid section-enter">
        <article className="card">
          <h2>Notifications</h2>
          <p className="muted">Permission: {notify}</p>
          <p className="muted">{supportsNativeNotifications() ? 'On Android, reminders are scheduled as native local notifications and can fire even when the app is not open.' : 'Reminders still appear inside the app while it is open. Browser alerts depend on permission and device support.'}</p>
          <button className="primary" type="button" onClick={enableNotifications}>Enable notifications</button>
        </article>
        <article className="card">
          <h2>Create reminder</h2>
          <form className="form" onSubmit={saveReminder}>
            <input value={reminderForm.title} onChange={(e) => setReminderForm((c) => ({ ...c, title: e.target.value }))} placeholder="Title" />
            <select value={reminderForm.kind} onChange={(e) => setReminderForm((c) => ({ ...c, kind: e.target.value as ReminderKind }))}><option value="glucose">Glucose check</option><option value="insulin">Insulin</option><option value="meal">Meal</option><option value="hydration">Hydration</option></select>
            <input type="time" value={reminderForm.time} onChange={(e) => setReminderForm((c) => ({ ...c, time: e.target.value }))} />
            <select value={reminderForm.repeat} onChange={(e) => setReminderForm((c) => ({ ...c, repeat: e.target.value as ReminderRepeat }))}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option></select>
            <button className="primary" type="submit">Save reminder</button>
          </form>
        </article>
        <article className="card wide">
          <h2>Saved reminders</h2>
          <div className="list">{reminders.length ? reminders.map((reminder) => <div key={reminder.id} className="row"><div><strong>{reminder.title}</strong><p>{getReminderKindLabel(reminder.kind)} | {reminder.time} | {formatRepeatLabel(reminder.repeat)}</p></div><div className="actions"><button className="secondary" type="button" onClick={() => toggleReminder(reminder.id)}>{reminder.enabled ? 'Pause' : 'Resume'}</button><button className="ghost" type="button" onClick={() => deleteReminder(reminder.id)}>Delete</button></div></div>) : <p className="muted">No reminders yet.</p>}</div>
        </article>
      </section> : null}

      {activeTab === 'reports' ? <section className="grid section-enter">
        <article className="card">
          <h2>Profile range</h2>
          <form className="form" onSubmit={saveProfile}>
            <input type="number" min="40" value={profileForm.lowTarget} onChange={(e) => setProfileForm((c) => ({ ...c, lowTarget: e.target.value }))} placeholder="Low target" />
            <input type="number" min="100" value={profileForm.highTarget} onChange={(e) => setProfileForm((c) => ({ ...c, highTarget: e.target.value }))} placeholder="High target" />
            <input type="number" min="1" value={profileForm.quickCarbGrams} onChange={(e) => setProfileForm((c) => ({ ...c, quickCarbGrams: e.target.value }))} placeholder="Fast carbs grams" />
            <button className="primary" type="submit">Save profile</button>
          </form>
        </article>
        <article className="card">
          <h2>Stats</h2>
          <div className="stats-list">
            <div><span>Glucose lows logged</span><strong>{lowCount}</strong></div>
            <div><span>Glucose highs logged</span><strong>{highCount}</strong></div>
            <div><span>Carb entries in 7 days</span><strong>{weeklyEntries.length}</strong></div>
            <div><span>Average carbs per entry</span><strong>{averageCarbs}g</strong></div>
          </div>
        </article>
        <article className="card wide">
          <h2>Supply checklist</h2>
          <div className="checklist">{supplyItems.map((item) => <label key={item.id} className="check"><input type="checkbox" checked={item.packed} onChange={() => toggleSupplyItem(item.id)} /><span>{item.label}</span></label>)}</div>
          <div className="actions"><button className="secondary" type="button" onClick={resetSupplyItems}>Reset checklist</button><button className="secondary" type="button" onClick={exportSnapshot}>Export JSON</button><button className="secondary" type="button" onClick={exportCsv}>Export CSV</button></div>
        </article>
      </section> : null}

      {activeTab === 'account' ? <section className="grid section-enter">
        <article className="card">
          <h2>Local account</h2>
          <form className="form" onSubmit={saveAccount}>
            <input value={accountForm.displayName} onChange={(e) => setAccountForm((c) => ({ ...c, displayName: e.target.value }))} placeholder="Display name" />
            <input value={accountForm.email} onChange={(e) => setAccountForm((c) => ({ ...c, email: e.target.value }))} placeholder="Email" />
            <input value={accountForm.diagnosisYear} onChange={(e) => setAccountForm((c) => ({ ...c, diagnosisYear: e.target.value }))} placeholder="Diagnosis year" />
            <input value={accountForm.therapy} onChange={(e) => setAccountForm((c) => ({ ...c, therapy: e.target.value }))} placeholder="Pump, MDI, pens, hybrid closed loop..." />
            <textarea value={accountForm.notes} onChange={(e) => setAccountForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Care notes, clinic questions, school plan notes..." />
            <label className="check consent-check">
              <input type="checkbox" checked={consent.allowAiSharing} onChange={(e) => updateConsent({ allowAiSharing: e.target.checked })} />
              <span>Allow live AI sharing with OpenRouter from this device.</span>
            </label>
            <p className="muted">This build already includes live AI access. You only need to keep AI sharing turned on if you want to use it.</p>
            <button className="primary" type="submit">Save account</button>
          </form>
        </article>
        <article className="card">
          <h2>History summary</h2>
          <div className="stats-list">
            <div><span>Account name</span><strong>{account.displayName || 'Not set'}</strong></div>
            <div><span>Foods saved</span><strong>{customFoods.length}</strong></div>
            <div><span>Carb entries</span><strong>{carbEntries.length}</strong></div>
            <div><span>Glucose notes</span><strong>{glucoseReadings.length}</strong></div>
            <div><span>Reminders</span><strong>{reminders.length}</strong></div>
            <div><span>AI setup</span><strong>{aiSetupLabel}</strong></div>
            <div><span>AI sharing</span><strong>{consent.allowAiSharing ? 'Enabled' : 'Off'}</strong></div>
            <div><span>Account created</span><strong>{format(new Date(account.createdAt), 'MMM d, yyyy')}</strong></div>
          </div>
        </article>
        <article className="card wide">
          <h2>Backups, privacy, and history</h2>
          <p className="muted">This account stores history on this device. Export it regularly if you want a backup or plan to move to another computer later.</p>
          <div className="actions"><a className="secondary link-button" href="./privacy.html" target="_blank" rel="noreferrer">Open privacy policy</a><button className="secondary" type="button" onClick={exportSnapshot}>Export full JSON backup</button><button className="secondary" type="button" onClick={exportCsv}>Export carb history CSV</button><button className="ghost" type="button" onClick={clearLocalData}>Delete all local data</button></div>
        </article>
      </section> : null}
    </main>
  )
}

function buildSummary(todayCarbs: number, entries: number, reminders: number, latest?: { value: number; context: string }) {
  return `Carbs today: ${Math.round(todayCarbs)}g across ${entries} entries. Enabled reminders: ${reminders}.${latest ? ` Latest glucose note: ${latest.value} mg/dL (${latest.context}).` : ''}`
}

function getReminderKindLabel(kind: ReminderKind) {
  return kind === 'glucose' ? 'Glucose' : kind === 'insulin' ? 'Insulin' : kind === 'meal' ? 'Meal' : 'Hydration'
}

function statusForGlucose(value: number, lowTarget: number, highTarget: number) {
  return value < lowTarget ? 'Below range' : value > highTarget ? 'Above range' : 'In range'
}

function classForGlucose(value: number, lowTarget: number, highTarget: number) {
  return value < lowTarget ? 'warn' : value > highTarget ? 'high' : 'ok'
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default App
