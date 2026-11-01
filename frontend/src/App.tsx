import { useEffect, useState } from 'react'

type Project = {
  id: number
  name: string
  status: 'draft' | 'processing' | 'completed' | 'failed'
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

const API = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '')

const MAX_SIZE = 500 * 1024 * 1024

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [videos, setVideos] = useState<VideoFile[]>([])

  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // AI RECAP STATE
  const [storyText, setStoryText] = useState('')
  const [targetMinutes, setTargetMinutes] = useState(5)
  const [tone, setTone] = useState('စိတ်ဝင်စားဖွယ်၊ ရင်ခုန်စရာ')
  const [generating, setGenerating] = useState(false)
  const [recapScript, setRecapScript] = useState('')

  async function checkHealth() {
    try {
      const res = await fetch(`${API}/api/health`)
      if (!res.ok) throw new Error()
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

  async function loadVideos(projectId: number) {
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/videos`)
      if (!res.ok) throw new Error('Video list could not be loaded')
      setVideos(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video loading error')
    }
  }

  useEffect(() => {
    void checkHealth()
    void loadProjects()
  }, [])

  useEffect(() => {
    if (selectedProject) {
      setVideos([])
      void loadVideos(selectedProject.id)
      setStoryText('')
      setRecapScript('')
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

  async function uploadVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''

    if (!file || !selectedProject) return

    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const allowed = ['mp4', 'mov', 'webm', 'm4v']

    if (!allowed.includes(extension)) {
      setError('MP4, MOV, WEBM, M4V ဖိုင်များသာ တင်နိုင်ပါတယ်။')
      return
    }

    if (file.size > MAX_SIZE) {
      setError('Video ဖိုင်အရွယ်အစား 500 MB ထက် မကြီးရပါ။')
      return
    }

    if (file.size === 0) {
      setError('ရွေးထားတဲ့ Video ဖိုင်က ဗလာဖြစ်နေပါတယ်။')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(
        `${API}/api/projects/${selectedProject.id}/videos`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Video Upload မအောင်မြင်ပါ။')
      }

      await res.json()
      setSuccess('Video Upload အောင်မြင်ပါပြီ။')
      await loadVideos(selectedProject.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload error')
    } finally {
      setUploading(false)
    }
  }

  // ==========================================
  // AI RECAP GENERATOR
  // ==========================================

  async function generateRecap() {
    if (storyText.trim().length < 20) {
      setError('ဇာတ်လမ်းအကြောင်းအရာ အနည်းဆုံး စာလုံး ၂၀ ထည့်ပေးပါ။')
      return
    }

    setGenerating(true)
    setError('')
    setSuccess('')
    setRecapScript('')

    try {
      const res = await fetch(`${API}/api/recap/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          story_text: storyText.trim(),
          target_minutes: targetMinutes,
          tone,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'AI Recap ရေးသားခြင်း မအောင်မြင်ပါ။'
        )
      }

      if (!data.script) {
        throw new Error('AI က ဇာတ်ညွှန်းပြန်မပေးခဲ့ပါ။')
      }

      setRecapScript(data.script)
      setSuccess('မြန်မာ AI Recap ဇာတ်ညွှန်း ရရှိပါပြီ။')
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'AI service connection error'
      )
    } finally {
      setGenerating(false)
    }
  }

  async function copyScript() {
    if (!recapScript) return

    try {
      await navigator.clipboard.writeText(recapScript)
      setSuccess('ဇာတ်ညွှန်းကို Copy ကူးပြီးပါပြီ။')
    } catch {
      setError('Copy မလုပ်နိုင်ပါ။ စာသားကို ဖိထားပြီး Copy လုပ်ပါ။')
    }
  }

  async function deleteProject(id: number) {
    if (!window.confirm('ဒီ Project ကို ဖျက်မှာ သေချာပါသလား။')) return

    try {
      const res = await fetch(`${API}/api/projects/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      setProjects(current => current.filter(p => p.id !== id))

      if (selectedProject?.id === id) {
        setSelectedProject(null)
        setVideos([])
        setRecapScript('')
        setStoryText('')
      }
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
          <i /> API {health === 'checking'
            ? 'စစ်ဆေးနေသည်'
            : health === 'online'
              ? 'ချိတ်ဆက်ပြီး'
              : 'မချိတ်ဆက်နိုင်ပါ'}
        </div>
      </header>

      {selectedProject ? (
        <>
          <section className="hero">
            <button
              onClick={() => {
                setSelectedProject(null)
                setVideos([])
                setRecapScript('')
                setStoryText('')
                setError('')
                setSuccess('')
              }}
              style={{
                background: '#1d3150',
                color: '#c9dcff',
                border: '1px solid #36517c',
                borderRadius: 9,
                padding: '10px 14px',
                cursor: 'pointer',
              }}
            >
              ← Project များသို့ ပြန်သွားရန်
            </button>

            <div className="eyebrow" style={{ marginTop: 28 }}>
              HWA PROJECT WORKSPACE
            </div>

            <h1 style={{ overflowWrap: 'anywhere' }}>
              {selectedProject.name}
            </h1>

            <p>ဒီ Project အတွက် ဗီဒီယိုနှင့် AI Recap ကို ဖန်တီးပါ။</p>
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

            <p style={{ color: '#aab6ca', fontSize: 13 }}>
              Project ID: {selectedProject.id}
            </p>

            <p style={{ color: '#aab6ca', fontSize: 13 }}>
              ဖန်တီးခဲ့သည့်အချိန်: {dateText(selectedProject.created_at)}
            </p>

            {error && <div className="error">{error}</div>}

            {success && (
              <p style={{ color: '#63dfa0', fontSize: 14 }}>
                ✓ {success}
              </p>
            )}

            {/* VIDEO UPLOAD */}

            <div
              style={{
                background: '#0b1424',
                border: '1px solid #34445e',
                borderRadius: 14,
                padding: 20,
                marginTop: 22,
              }}
            >
              <div style={{ fontSize: 34 }}>🎬</div>

              <h2 style={{ color: '#eef3ff', fontSize: 19 }}>
                Video Upload
              </h2>

              <p style={{
                color: '#91a0b8',
                fontSize: 13,
                lineHeight: 1.8,
              }}>
                ဖုန်းထဲက မူရင်းဗီဒီယိုကို ရွေးပြီး HWA ထဲသို့ တင်နိုင်ပါပြီ။
                MP4, MOV, WEBM, M4V · အများဆုံး 500 MB
              </p>

              <label
                style={{
                  display: 'inline-block',
                  background: uploading ? '#34445e' : '#2865d8',
                  color: '#fff',
                  borderRadius: 9,
                  padding: '13px 20px',
                  cursor: uploading ? 'wait' : 'pointer',
                  fontWeight: 700,
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading
                  ? 'တင်နေသည်... ခဏစောင့်ပါ'
                  : '＋ Video ရွေးပြီး Upload လုပ်ရန်'}

                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
                  disabled={uploading}
                  onChange={uploadVideo}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* AI RECAP GENERATOR */}

            <div
              style={{
                background: '#0b1424',
                border: '1px solid #49618c',
                borderRadius: 14,
                padding: 20,
                marginTop: 24,
              }}
            >
              <div style={{ fontSize: 34 }}>✨</div>

              <small style={{ color: '#8bb8ff', fontWeight: 700 }}>
                STAGE 4 · GEMINI AI
              </small>

              <h2 style={{ color: '#eef3ff', fontSize: 21 }}>
                မြန်မာ AI Recap ဖန်တီးရန်
              </h2>

              <p style={{
                color: '#aab6ca',
                fontSize: 13,
                lineHeight: 1.8,
              }}>
                ဇာတ်လမ်းအကြောင်းအရာ သို့မဟုတ် Transcript ကို ထည့်ပါ။
                HWA က YouTube အတွက် မြန်မာ Recap ဇာတ်ညွှန်းရေးပေးပါမယ်။
              </p>

              <label style={{
                display: 'block',
                color: '#dce7fb',
                fontWeight: 700,
                marginTop: 18,
                marginBottom: 8,
              }}>
                ဇာတ်လမ်းအကြောင်းအရာ
              </label>

              <textarea
                value={storyText}
                onChange={e => setStoryText(e.target.value)}
                placeholder="ဒီနေရာမှာ ဇာတ်လမ်းအကြောင်းအရာကို ရေးထည့်ပါ။ အနည်းဆုံး စာလုံး ၂၀ လိုအပ်ပါတယ်..."
                rows={9}
                maxLength={30000}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#101e32',
                  color: '#eef3ff',
                  border: '1px solid #405574',
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 14,
                  lineHeight: 1.8,
                  resize: 'vertical',
                  outline: 'none',
                }}
              />

              <small style={{
                color: '#91a0b8',
                display: 'block',
                textAlign: 'right',
                marginTop: 5,
              }}>
                {storyText.length.toLocaleString()} / 30,000
              </small>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginTop: 18,
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    color: '#dce7fb',
                    fontSize: 13,
                    marginBottom: 8,
                  }}>
                    ကြာချိန်
                  </label>

                  <select
                    value={targetMinutes}
                    onChange={e => setTargetMinutes(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 9,
                      background: '#101e32',
                      color: '#eef3ff',
                      border: '1px solid #405574',
                    }}
                  >
                    <option value={1}>၁ မိနစ်</option>
                    <option value={3}>၃ မိနစ်</option>
                    <option value={5}>၅ မိနစ်</option>
                    <option value={10}>၁၀ မိနစ်</option>
                    <option value={15}>၁၅ မိနစ်</option>
                    <option value={20}>၂၀ မိနစ်</option>
                    <option value={30}>၃၀ မိနစ်</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    color: '#dce7fb',
                    fontSize: 13,
                    marginBottom: 8,
                  }}>
                    အသံနေအသံထား
                  </label>

                  <select
                    value={tone}
                    onChange={e => setTone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 9,
                      background: '#101e32',
                      color: '#eef3ff',
                      border: '1px solid #405574',
                    }}
                  >
                    <option value="စိတ်ဝင်စားဖွယ်၊ ရင်ခုန်စရာ">
                      ရင်ခုန်စရာ
                    </option>
                    <option value="ရုပ်ရှင်ဇာတ်လမ်းပြောသလို">
                      ရုပ်ရှင်ဆန်ဆန်
                    </option>
                    <option value="ရယ်စရာနှင့် ပေါ့ပေါ့ပါးပါး">
                      ပေါ့ပေါ့ပါးပါး
                    </option>
                    <option value="လေးနက်ပြီး စိတ်လှုပ်ရှားဖွယ်">
                      လေးနက်သောပုံစံ
                    </option>
                    <option value="သဘာဝကျပြီး ရှင်းလင်းသော">
                      သဘာဝကျသောပုံစံ
                    </option>
                  </select>
                </div>
              </div>

              <button
                onClick={() => void generateRecap()}
                disabled={generating || storyText.trim().length < 20}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: 15,
                  border: 'none',
                  borderRadius: 10,
                  background: generating ? '#405574' : '#2865d8',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: generating ? 'wait' : 'pointer',
                  opacity: generating || storyText.trim().length < 20
                    ? 0.65
                    : 1,
                }}
              >
                {generating
                  ? '✨ AI က ဇာတ်ညွှန်းရေးနေပါတယ်...'
                  : '✨ မြန်မာ AI Recap ဖန်တီးမည်'}
              </button>

              {generating && (
                <p style={{
                  color: '#aab6ca',
                  fontSize: 13,
                  textAlign: 'center',
                  marginTop: 12,
                }}>
                  AI အဖြေပြန်လာသည်အထိ ခဏစောင့်ပေးပါ။
                </p>
              )}

              {recapScript && (
                <div style={{
                  marginTop: 24,
                  borderTop: '1px solid #34445e',
                  paddingTop: 20,
                }}>
                  <div className="section-head">
                    <div>
                      <small>AI GENERATED SCRIPT</small>
                      <h2>မြန်မာ Recap ဇာတ်ညွှန်း</h2>
                    </div>
                  </div>

                  <textarea
                    value={recapScript}
                    onChange={e => setRecapScript(e.target.value)}
                    rows={16}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#101e32',
                      color: '#eef3ff',
                      border: '1px solid #405574',
                      borderRadius: 10,
                      padding: 14,
                      fontSize: 14,
                      lineHeight: 1.9,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />

                  <button
                    onClick={() => void copyScript()}
                    style={{
                      width: '100%',
                      marginTop: 12,
                      padding: 13,
                      background: '#176b50',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 9,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📋 ဇာတ်ညွှန်း Copy ကူးရန်
                  </button>

                  <p style={{
                    color: '#91a0b8',
                    fontSize: 12,
                    lineHeight: 1.8,
                  }}>
                    ဇာတ်ညွှန်းကို အောက်ကစာသားနေရာမှာ တိုက်ရိုက်ပြင်ဆင်နိုင်ပါတယ်။
                    လက်ရှိတွင် Project ထဲ အလိုအလျောက် သိမ်းဆည်းခြင်း မပါသေးပါ။
                  </p>
                </div>
              )}
            </div>

            {/* UPLOADED VIDEOS */}

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
                videos.map(video => (
                  <div
                    key={video.id}
                    style={{
                      background: '#0b1424',
                      border: '1px solid #34445e',
                      borderRadius: 12,
                      padding: 14,
                      marginTop: 14,
                    }}
                  >
                    <b style={{
                      color: '#eef3ff',
                      overflowWrap: 'anywhere',
                    }}>
                      🎬 {video.original_filename}
                    </b>

                    <p style={{ color: '#91a0b8', fontSize: 12 }}>
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
                    >
                      Your browser does not support video playback.
                    </video>
                  </div>
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
              <b>Myanmar AI Recap</b>
              <small>Script · Editing</small>
              <em>ACTIVE</em>
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
              မြန်မာအသံ AI Recap၊ Subtitle နဲ့ Professional Video Editing
              အတွက် သီးသန့် Workspace အသစ်။
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
              <em>IN PROGRESS</em>
            </div>

            <div className="feature">
              <span>02</span>
              <b>Myanmar AI Recap</b>
              <small>Script · Recap</small>
              <em>ACTIVE API</em>
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

      <footer>
        HWA MYANMAR AI VIDEO EDITOR
        <span>Independent project · v0.4.0</span>
      </footer>
    </main>
  )
}
