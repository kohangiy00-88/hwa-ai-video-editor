import { useEffect, useState } from 'react'

type Project = {
  id: number
  name: string
  status: 'draft' | 'processing' | 'completed' | 'failed'
  created_at: string
  updated_at: string
}

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function checkHealth() {
    try {
      const res = await fetch(`${API}/api/health`)
      if (!res.ok) throw new Error('API unavailable')
      setHealth('online')
    } catch {
      setHealth('offline')
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch(`${API}/api/projects`)
      if (!res.ok) throw new Error('Project list could not be loaded')
      setProjects(await res.json())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection error')
    }
  }

  useEffect(() => {
    void checkHealth()
    void loadProjects()
  }, [])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Project creation failed')
      const created: Project = await res.json()
      setProjects(current => [created, ...current])
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection error')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject(id: number) {
    if (!window.confirm('ဒီ Project ကို ဖျက်မှာ သေချာပါသလား။')) return
    try {
      const res = await fetch(`${API}/api/projects/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setProjects(current => current.filter(p => p.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete error')
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="logo">MV</div><div><b>Myanmar AI Editor</b><small>VIDEO WORKSPACE · STAGE 1</small></div></div>
        <div className={`status ${health}`}><i /> API {health === 'checking' ? 'စစ်ဆေးနေသည်' : health === 'online' ? 'ချိတ်ဆက်ပြီး' : 'မချိတ်ဆက်နိုင်ပါ'}</div>
      </header>

      <section className="hero">
        <div className="eyebrow">YOUR CREATIVE WORKSPACE</div>
        <h1>ဗီဒီယိုတည်းဖြတ်မှုကို<br/><span>စတင်လိုက်ပါ။</span></h1>
        <p>မြန်မာအသံ AI Recap၊ Subtitle နဲ့ Professional Video Editing အတွက် သီးသန့် Workspace အသစ်။</p>
        <div className="stage-pill">✦ STAGE 1 · FOUNDATION READY</div>
      </section>

      <section className="panel">
        <div className="section-head"><div><small>WORKSPACE</small><h2>Project အသစ်ဖန်တီးရန်</h2></div><span className="count">{projects.length} PROJECTS</span></div>
        <form onSubmit={createProject} className="create-form">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Project အမည် ထည့်ပါ..." aria-label="Project name"/>
          <button disabled={busy || !name.trim()}>{busy ? 'ဖန်တီးနေသည်...' : '+ Create'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        <div className="project-list">
          {projects.length === 0 ? <div className="empty"><div className="empty-icon">▧</div><b>Project မရှိသေးပါ</b><span>အပေါ်မှာ Project အမည်ထည့်ပြီး စတင်ပါ။</span></div> :
            projects.map(project => <article className="project" key={project.id}>
              <div className="project-icon">▶</div><div className="project-info"><b>{project.name}</b><span>Created {new Date(project.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</span></div>
              <span className="draft">{project.status}</span><button className="delete" onClick={() => void deleteProject(project.id)} aria-label="Delete project">×</button>
            </article>)
          }
        </div>
      </section>

      <section className="feature-grid">
        <div className="feature"><span>01</span><b>Smart Video Engine</b><small>Upload · Scene · Keyframes</small><em>COMING IN STAGE 2</em></div>
        <div className="feature"><span>02</span><b>Myanmar AI Voice</b><small>Female · Male · Recap</small><em>COMING IN STAGE 3</em></div>
        <div className="feature"><span>03</span><b>Subtitle Designer</b><small>Color · Position · Preview</small><em>COMING IN STAGE 4</em></div>
        <div className="feature"><span>04</span><b>Render Studio</b><small>720p · 1080p · 4K</small><em>COMING IN STAGE 5</em></div>
      </section>
      <footer>MYANMAR AI VIDEO EDITOR <span>Independent project · v0.1.0</span></footer>
    </main>
  )
}
