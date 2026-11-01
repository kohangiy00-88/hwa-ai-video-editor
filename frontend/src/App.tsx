
import { useEffect, useState } from 'react'

type Project = {
  id: number
  name: string
  status: string
  created_at: string
  updated_at: string
}

type VideoFile = {
  id: number
  project_id: number
  original_filename: string
  content_type: string
  size_bytes: number
  created_at: string
  file_url: string
}

type Analysis = {
  status: string
  text?: string
}

const API = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '')

const MAX_SIZE = 500 * 1024 * 1024

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [videos, setVideos] = useState<VideoFile[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [name, setName] = useState('')

  const [health, setHealth] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState<number | null>(null)

  const [results, setResults] = useState<Record<number, Analysis>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadProjects() {
    try {
      const res = await fetch(`${API}/api/projects`)
      if (!res.ok) throw new Error('Project များ ဖတ်မရပါ။')
      setProjects(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection error')
    }
  }

  async function loadVideos(projectId: number) {
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/videos`)
      if (!res.ok) throw new Error('Video များ ဖတ်မရပါ။')
      setVideos(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video loading error')
    }
  }

  async function checkHealth() {
    try {
      const res = await fetch(`${API}/api/health`)
      if (!res.ok) throw new Error()
      setHealth('online')
    } catch {
      setHealth('offline')
    }
  }

  useEffect(() => {
    void checkHealth()
    void loadProjects()
  }, [])

  useEffect(() => {
    if (selectedProject) {
      setVideos([])
      setResults({})
      void loadVideos(selectedProject.id)
    }
  }, [selectedProject?.id])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Project ဖန်တီးမရပါ။')

      setProjects(current => [data, ...current])
      setName('')
      setSelectedProject(data)
      setSuccess('Project ဖန်တီးပြီးပါပြီ။')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create error')
    } finally {
      setBusy(false)
    }
  }

  async function uploadVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!file || !selectedProject) return

    const extension = file.name.split('.').pop()?.toLowerCase() || ''

    if (!['mp4', 'mov', 'webm', 'm4v'].includes(extension)) {
      setError('MP4, MOV, WEBM, M4V ဖိုင်များသာ တင်နိုင်ပါတယ်။')
      return
    }

    if (file.size > MAX_SIZE) {
      setError('Video ဖိုင်အရွယ်အစား 500 MB ထက် မကြီးရပါ။')
      return
    }

    if (!file.size) {
      setError('Video ဖိုင်က ဗလာဖြစ်နေပါတယ်။')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(
        `${API}/api/projects/${selectedProject.id}/videos`,
        { method: 'POST', body: form }
      )

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Upload မအောင်မြင်ပါ။')

      await loadVideos(selectedProject.id)
      setSuccess('Video Upload အောင်မြင်ပါပြီ။')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload error')
    } finally {
      setUploading(false)
    }
  }

  async function analyzeVideo(video: VideoFile) {
    if (analyzing !== null) return

    setAnalyzing(video.id)
    setError('')
    setSuccess('')
    setResults(current => ({
      ...current,
      [video.id]: { status: 'processing' },
    }))

    try {
      const res = await fetch(
        `${API}/api/videos/${video.id}/analyze`,
        { method: 'POST' }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'AI Video Analysis မအောင်မြင်ပါ။'
        )
      }

      if (!data.analysis) {
        throw new Error('AI က Analysis ရလဒ် မပြန်ပေးခဲ့ပါ။')
      }

      setResults(current => ({
        ...current,
        [video.id]: {
          status: 'completed',
          text: data.analysis,
        },
      }))

      setSuccess('AI Video Analysis ပြီးပါပြီ။')
    } catch (e) {
      const message = e instanceof Error
        ? e.message
        : 'AI connection error'

      setResults(current => ({
        ...current,
        [video.id]: {
          status: 'failed',
          text: message,
        },
      }))

      setError(message)
    } finally {
      setAnalyzing(null)
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess('Copy ကူးပြီးပါပြီ။')
    } catch {
      setError('Copy မရပါ။ စာသားကို ဖိထားပြီး Copy လုပ်ပါ။')
    }
  }

  async function deleteProject(id: number) {
    if (!window.confirm('ဒီ Project ကို ဖျက်မှာ သေချာပါသလား။')) return

    try {
      const res = await fetch(`${API}/api/projects/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete မအောင်မြင်ပါ။')

      setProjects(current => current.filter(p => p.id !== id))

      if (selectedProject?.id === id) {
        setSelectedProject(null)
        setVideos([])
        setResults({})
      }

      setSuccess('Project ဖျက်ပြီးပါပြီ။')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete error')
    }
  }

  const dateText = (date: string) =>
    new Date(date.replace(' ', 'T') + 'Z').toLocaleString()

  const fileSize = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`

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
          <i />
          API {health === 'online'
            ? 'ချိတ်ဆက်ပြီး'
            : health === 'offline'
              ? 'မချိတ်ဆက်နိုင်ပါ'
              : 'စစ်ဆေးနေသည်'}
        </div>
      </header>

      {selectedProject ? (
        <>
          <section className="hero">
            <button
              onClick={() => {
                setSelectedProject(null)
                setVideos([])
                setResults({})
                setError('')
                setSuccess('')
              }}
              style={buttonStyle}
            >
              ← Project များသို့ ပြန်သွားရန်
            </button>

            <div className="eyebrow" style={{ marginTop: 28 }}>
              HWA PROJECT WORKSPACE
            </div>

            <h1 style={{ overflowWrap: 'anywhere' }}>
              {selectedProject.name}
            </h1>

            <p>Video တင်ပြီး မြန်မာ AI နဲ့ ဇာတ်လမ်းကို ခွဲခြမ်းစိတ်ဖြာပါ။</p>
            <div className="stage-pill">✦ HWA AI WORKSPACE</div>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <small>PROJECT DETAILS</small>
                <h2>Project အချက်အလက်</h2>
              </div>
              <span className="draft">{selectedProject.status}</span>
            </div>

            <p style={mutedStyle}>Project ID: {selectedProject.id}</p>
            <p style={mutedStyle}>
              ဖန်တီးခဲ့သည့်အချိန်: {dateText(selectedProject.created_at)}
            </p>

            {error && <div className="error">{error}</div>}
            {success && <p style={{ color: '#63dfa0' }}>✓ {success}</p>}

            <div style={panelStyle}>
              <div style={{ fontSize: 34 }}>🎬</div>
              <h2 style={headingStyle}>Video Upload</h2>
              <p style={mutedStyle}>
                ဖုန်းထဲက မူရင်းဗီဒီယိုကို ရွေးပြီး HWA ထဲသို့ တင်ပါ။
                MP4, MOV, WEBM, M4V · အများဆုံး 500 MB
              </p>

              <label style={{
                ...primaryButtonStyle,
                display: 'inline-block',
                opacity: uploading ? 0.6 : 1,
              }}>
                {uploading ? 'တင်နေသည်... ခဏစောင့်ပါ' : '＋ Video ရွေးပြီး Upload လုပ်ရန်'}
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
                  disabled={uploading}
                  onChange={uploadVideo}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="section-head">
                <div>
                  <small>UPLOADED FILES</small>
                  <h2>တင်ထားသော ဗီဒီယိုများ</h2>
                </div>
                <span className="count">{videos.length} VIDEOS</span>
              </div>

              {videos.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🎞️</div>
                  <b>Video မရှိသေးပါ</b>
                  <span>အပေါ်က ခလုတ်ကိုနှိပ်ပြီး Video တင်နိုင်ပါတယ်။</span>
                </div>
              ) : (
                videos.map(video => {
                  const result = results[video.id]
                  const isAnalyzing = analyzing === video.id

                  return (
                    <div key={video.id} style={videoCardStyle}>
                      <b style={{
                        color: '#eef3ff',
                        overflowWrap: 'anywhere',
                      }}>
                        🎬 {video.original_filename}
                      </b>

                      <p style={mutedStyle}>
                        {fileSize(video.size_bytes)} · {dateText(video.created_at)}
                      </p>

                      <video
                        controls
                        playsInline
                        preload="metadata"
                        src={`${API}${video.file_url}`}
                        style={{
                          display: 'block',
                          width: '100%',
                          maxHeight: 360,
                          background: '#000',
                          borderRadius: 10,
                          marginTop: 12,
                        }}
                      />

                      <button
                        onClick={() => void analyzeVideo(video)}
                        disabled={analyzing !== null}
                        style={{
                          ...primaryButtonStyle,
                          width: '100%',
                          marginTop: 16,
                          opacity: analyzing !== null ? 0.6 : 1,
                        }}
                      >
                        {isAnalyzing
                          ? '✨ Gemini AI က ဗီဒီယိုကို စစ်ဆေးနေပါတယ်...'
                          : result?.status === 'completed'
                            ? '🔄 AI Analysis ထပ်လုပ်ရန်'
                            : '✨ AI Analyze — ဗီဒီယိုကို စစ်ဆေးမည်'}
                      </button>

                      {isAnalyzing && (
                        <p style={{
                          color: '#aab6ca',
                          textAlign: 'center',
                          fontSize: 13,
                          lineHeight: 1.8,
                        }}>
                          ဗီဒီယိုအရွယ်အစားနဲ့ ကြာချိန်ပေါ်မူတည်ပြီး
                          အချိန်ယူနိုင်ပါတယ်။ စာမျက်နှာကို မပိတ်သေးပါနဲ့။
                        </p>
                      )}

                      {result?.status === 'failed' && (
                        <div className="error" style={{ marginTop: 14 }}>
                          AI စစ်ဆေးမှု မအောင်မြင်ပါ။
                          <p>{result.text}</p>
                        </div>
                      )}

                      {result?.status === 'completed' && result.text && (
                        <div style={{
                          ...panelStyle,
                          marginTop: 18,
                          borderColor: '#287a5c',
                        }}>
                          <small style={{ color: '#63dfa0' }}>
                            GEMINI AI ANALYSIS · COMPLETED
                          </small>
                          <h2 style={headingStyle}>
                            မြန်မာ AI ခွဲခြမ်းစိတ်ဖြာချက်
                          </h2>

                          <div style={{
                            color: '#eef3ff',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                            lineHeight: 1.9,
                            fontSize: 14,
                          }}>
                            {result.text}
                          </div>

                          <button
                            onClick={() => void copyText(result.text!)}
                            style={{
                              ...primaryButtonStyle,
                              width: '100%',
                              marginTop: 16,
                              background: '#176b50',
                            }}
                          >
                            📋 Analysis Copy ကူးရန်
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="feature-grid">
            <div className="feature">
              <span>01</span>
              <b>Video Upload</b>
              <small>Upload · Preview</small>
              <em>ACTIVE</em>
            </div>
            <div className="feature">
              <span>02</span>
              <b>Gemini Video AI</b>
              <small>Story · Characters · Scenes</small>
              <em>API CONNECTED</em>
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
            <h1>
              ဗီဒီယိုတည်းဖြတ်မှုကို<br />
              <span>စတင်လိုက်ပါ။</span>
            </h1>
            <p>
              HWA Myanmar AI Video Editor · Video Upload · AI Story Analysis
            </p>
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
            {success && <p style={{ color: '#63dfa0' }}>✓ {success}</p>}

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
              <b>Video Upload</b>
              <small>Upload · Preview</small>
              <em>ACTIVE</em>
            </div>
            <div className="feature">
              <span>02</span>
              <b>Myanmar AI Analysis</b>
              <small>Gemini · Story</small>
              <em>API CONNECTED</em>
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
      )}

      <footer>
        HWA MYANMAR AI VIDEO EDITOR
        <span>Independent project · v0.5.0</span>
      </footer>
    </main>
  )
}

const buttonStyle: React.CSSProperties = {
  background: '#1d3150',
  color: '#c9dcff',
  border: '1px solid #36517c',
  borderRadius: 9,
  padding: '10px 14px',
  cursor: 'pointer',
}

const mutedStyle: React.CSSProperties = {
  color: '#91a0b8',
  fontSize: 13,
  lineHeight: 1.8,
}

const headingStyle: React.CSSProperties = {
  color: '#eef3ff',
  fontSize: 19,
}

const panelStyle: React.CSSProperties = {
  background: '#0b1424',
  border: '1px solid #34445e',
  borderRadius: 14,
  padding: 20,
  marginTop: 22,
}

const videoCardStyle: React.CSSProperties = {
  background: '#0b1424',
  border: '1px solid #34445e',
  borderRadius: 12,
  padding: 14,
  marginTop: 14,
}

const primaryButtonStyle: React.CSSProperties = {
  background: '#2865d8',
  color: '#fff',
  border: 'none',
  borderRadius: 9,
  padding: '13px 18px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 14,
}
