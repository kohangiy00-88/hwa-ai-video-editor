
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
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
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

      if (!res.ok) throw new Error('Project creation failed')

      const created: Project = await res.json()
      setProjects(current => [created, ...current])
      setName('')
      setSelectedProject(created)
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
      if (selectedProject?.id === id) setSelectedProject(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete error')
    }
  }

  const dateText = (date: string) =>
    new Date(date.replace(' ', 'T') + 'Z').toLocaleString()

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">HWA</div>
          <div>
            <b>HWA Myanmar AI Editor</b>
            <small>VIDEO WORKSPACE</small>
          </div>
        </div>
        <div className={`status ${health}`}>
          <i /> API {health === 'checking' ? 'စစ်ဆေးနေသည်' : health === 'online' ? 'ချိတ်ဆက်ပြီး' : 'မချိတ်ဆက်နိုင်ပါ'}
        </div>
      </header>

      {selectedProject ? (
        <>
          <section className="hero">
            <button
              onClick={() => setSelectedProject(null)}
              style={{ background: '#1d3150', color: '#c9dcff', border: '1px solid #36517c', borderRadius: 9, padding: '10px 14px', cursor: 'pointer' }}
            >
              ← Project များသို့ ပြန်သွားရန်
            </button>
            <div className="eyebrow" style={{ marginTop: 28 }}>HWA PROJECT WORKSPACE</div>
            <h1 style={{ overflowWrap: 'anywhere' }}>{selectedProject.name}</h1>
            <p>ဒီ Project အတွက် ဗီဒီယိုတည်းဖြတ်မှုကို ဒီနေရာကနေ စတင်နိုင်ပါမယ်။</p>
            <div className="stage-pill">✦ PROJECT CREATED · READY</div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <small>PROJECT DETAILS</small>
                <h2>Project အချက်အလက်</h2>
              </div>
              <span className="draft">{selectedProject.status}</span>
            </div>

            <p style={{ color: '#aab6ca', fontSize: 13 }}>
              Project ID: {selectedProject.id}
            </p>
            <p style={{ color: '#aab6ca', fontSize: 13 }}>
              ဖန်တီးခဲ့သည့်အချိန်: {dateText(selectedProject.created_at)}
            </p>

            <div style={{ background: '#0b1424', border: '1px solid #34445e', borderRadius: 14, padding: 20, marginTop: 22 }}>
              <div style={{ fontSize: 34 }}>🎬</div>
              <h2 style={{ color: '#eef3ff', fontSize: 19 }}>Video Upload</h2>
              <p style={{ color: '#91a0b8', fontSize: 13, lineHeight: 1.8 }}>
                နောက်အဆင့်မှာ မူရင်းဗီဒီယိုကို တင်နိုင်ပြီး Preview ကြည့်နိုင်အောင် ထည့်သွင်းပေးမယ်။
              </p>
              <button
                disabled
                style={{ background: '#34445e', color: '#aab6ca', border: 0, borderRadius: 9, padding: '12px 18px', opacity: 0.8 }}
              >
                နောက်အဆင့်တွင် အသုံးပြုနိုင်မည်
              </button>
            </div>
          </section>

          <section className="feature-grid">
            <div className="feature">
              <span>01</span>
              <b>Video Upload</b>
              <small>Upload · Preview</small>
              <em>COMING NEXT</em>
            </div>
            <div className="feature">
              <span>02</span>
              <b>Myanmar AI Voice</b>
              <small>Male · Female · Recap</small>
              <em>PLANNED</em>
            </div>
            <div className="feature">
              <span>03</span>
              <b>Subtitle Designer</b>
              <small>Color · Position</small>
              <em>PLANNED</em>
            </div>
            <div className="feature">
              <span>04</span>
              <b>Render Studio</b>
              <small>720p · 1080p · 4K</small>
              <em>PLANNED</em>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="hero">
            <div className="eyebrow">YOUR CREATIVE WORKSPACE</div>
            <h1>ဗီဒီယိုတည်းဖြတ်မှုကို<br /><span>စတင်လိုက်ပါ။</span></h1>
            <p>မြန်မာအသံ AI Recap၊ Subtitle နဲ့ Professional Video Editing အတွက် သီးသန့် Workspace အသစ်။</p>
            <div className="stage-pill">✦ HWA · FOUNDATION READY</div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <small>WORKSPACE</small>
                <h2>Project အသစ်ဖန်တီးရန်</h2>
              </div>
              <span className="count">{projects.length} PROJECTS</span>
            </div>

            <form onSubmit={createProject} className="create-form">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={100}
                placeholder="Project အမည် ထည့်ပါ..."
                aria-label="Project name"
              />
              <button disabled={busy || !name.trim()}>
                {busy ? 'ဖန်တီးနေသည်...' : '+ Create'}
              </button>
            </form>

            {error && <div className="error">{error}</div>}

            <div className="project-list">
              {projects.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">▧</div>
                  <b>Project မရှိသေးပါ</b>
                  <span>အပေါ်မှာ Project အမည်ထည့်ပြီး စတင်ပါ။</span>
                </div>
              ) : (
                projects.map(project => (
                  <article
                    className="project"
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedProject(project)
                      }
                    }}
                  >
                    <div className="project-icon">▶</div>
                    <div className="project-info">
                      <b>{project.name}</b>
                      <span>Created {dateText(project.created_at)}</span>
                    </div>
                    <span className="draft">{project.status}</span>
                    <button
                      className="delete"
                      onClick={e => {
                        e.stopPropagation()
                        void deleteProject(project.id)
                      }}
                      aria-label="Delete project"
                    >
                      ×
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="feature-grid">
            <div className="feature">
              <span>01</span>
              <b>Smart Video Engine</b>
              <small>Upload · Scene · Keyframes</small>
              <em>COMING SOON</em>
            </div>
            <div className="feature">
              <span>02</span>
              <b>Myanmar AI Voice</b>
              <small>Female · Male · Recap</small>
              <em>COMING SOON</em>
            </div>
            <div className="feature">
              <span>03</span>
              <b>Subtitle Designer</b>
              <small>Color · Position · Preview</small>
              <em>COMING SOON</em>
            </div>
            <div className="feature">
              <span>04</span>
              <b>Render Studio</b>
              <small>720p · 1080p · 4K</small>
              <em>COMING SOON</em>
            </div>
          </section>
        </>
      )}

      <footer>HWA MYANMAR AI VIDEO EDITOR <span>Independent project · v0.2.0</span></footer>
    </main>
  )
}
