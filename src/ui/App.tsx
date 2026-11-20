import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { CAMS, KEYS, PAD_KEYS, bindKeys, toggleEngine, touch } from '../input';
import { FULL, NIGHT, setNight, setQuality } from '../scene/Adaptive';
import { Experience } from '../scene/Experience';
import { FpsWarn } from '../scene/FpsWarn';
import { bucketCap, bucketKg, guidance, machineMass, powerMax, progress, resetRodeo, setArm, setGauge, setRain, setUnder, swapTool } from '../sim/excavator';
import type { JobId } from '../sim/site';
import { ARMS, SHOES, SPEC, type ArmId, type ShoeId, type ToolId } from '../sim/spec';
import { SOIL } from '../sim/terrain';
import { TRUCK } from '../sim/trucks';
import { ensureAudio, setSound, soundOn, soundStatus } from '../sound';
import { ex, resetAll, useUI, type CamMode } from '../store';

const CAM_LABEL: Record<CamMode, string> = { orbit: 'Orbit', cab: 'Kabin', bucket: 'Kamera arm', spotter: 'Spotter', top: 'Atas' };
const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const t = (kg: number) => `${fmt(kg / 1000)} t`;

const JOBS: { id: JobId; name: string; text: string; link?: [string, string] }[] = [
  { id: 'truck', name: '1 · Isi dump truck', text: 'Gali bukit tanah, isi truk 55 t yang datang bergantian. Jangan kelebihan muatan (>110%), jangan membentur bak atau kabin. Klakson (B) menyuruh truk berangkat. Skor: jumlah truk, ton, liter solar per m³.' },
  { id: 'trench', name: '2 · Parit dengan machine guidance', text: 'Parit lurus 38 m, lebar dasar 2 m, kemiringan 1%. Layar guidance menunjukkan ujung gigi terhadap desain (cm). Ada pipa gas di sisi parit dan kabel fiber melintang: ikuti isyarat spotter.' },
  { id: 'canal', name: '3 · Kanal drainase kebun sawit', text: 'Gali kanal di lahan gambut basah (air tanah tinggi, kanal terisi air) dan timbun tanahnya menjadi jalan kebun di sisi utara. Gambut lunak: track bisa amblas, pakai shoe lebar.', link: ['Simulator traktor MF 5M.145', 'https://ramantyads.github.io/Tractor-Simulator/'] },
  { id: 'foundation', name: '4 · Galian pondasi genset', text: 'Galian 7 × 4 m sedalam 1,6 m dengan dasar rata ±5 cm di depan rumah genset. Genset 2250 kVA akan dipasang crane di sini.', link: ['Simulator crane', 'https://ramantyads.github.io/Crane-Simulator/'] },
  { id: 'breaker', name: '5 · Pecah batu dengan breaker', text: 'Ganti ke breaker di rak quick coupler (dekat titik awal). Di tebing quarry barat laut: tekan chisel ke batu, tahan R untuk memalu. Batu pecah bisa digali dengan bucket.' },
  { id: 'logs', name: '6 · Pindahkan kayu dengan grapple', text: 'Ganti ke grapple di rak. Ambil 6 batang kayu (R menutup capit) dan letakkan di lingkaran kuning TUMPUKAN KAYU.' },
  { id: 'lowbed', name: '7 · Naik ke lowbed', text: 'Trik operator: naik ke trailer lowbed lewat ramp belakang dengan track lurus, berhenti di tengah dek, rata. Pelan di ujung ramp: titik berat pindah saat melewati engsel.' },
  { id: 'amphib', name: '8 · Amfibi: seberangi rawa', text: 'Pasang undercarriage amfibi (tab Setup) dan berenang menyeberangi rawa di blok gambut ke patok kuning. Ponton kustom 11 m: untuk PC800 ini bukan produk standar Komatsu.' },
  { id: 'rodeo', name: '9 · Excavator Rodeo', text: 'Lomba keterampilan operator: masukkan bola oranye ke drum biru, letakkan telur di atas tiang tanpa pecah, dorong 3 ban ke lingkaran kuning. Waktu dihitung.' },
  { id: 'free', name: 'Gali bebas', text: 'Seluruh site bebas digali: bukit lempung, pasir di timur, gambut di barat daya, batu di barat laut (perlu breaker).' },
];

function Tabs({ tab, set }: { tab: string; set: (t: string) => void }) {
  const items: [string, string][] = [
    ['mesin', 'Mesin'],
    ['misi', 'Misi'],
    ['setup', 'Setup'],
    ['tampil', 'Tampilan'],
  ];
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function EnginePanel() {
  useUI((s) => s.tick);
  return (
    <>
      <h3>Mesin {SPEC.engine.model} · {SPEC.engine.kw} kW</h3>
      <div className="row">
        <button className={ex.engine !== 'off' ? 'on' : ''} onClick={toggleEngine}>
          {ex.engine === 'off' ? 'Hidupkan (Enter)' : ex.engine === 'starting' ? 'Starter…' : 'Matikan (Enter)'}
        </button>
        <button className={ex.locked ? 'on danger' : ''} onClick={() => (ex.locked = !ex.locked)}>
          {ex.locked ? 'PPC terkunci (P)' : 'PPC aktif (P)'}
        </button>
      </div>
      <label className="slider">
        <span>Dial bahan bakar · {Math.round(ex.rpm)} rpm</span>
        <input type="range" min={0} max={1} step={0.1} value={ex.dial} onChange={(e) => (ex.dial = +e.target.value)} />
      </label>
      <h3>Mode kerja (M)</h3>
      <div className="row">
        {(['P', 'E', 'L'] as const).map((m) => (
          <button key={m} className={ex.mode === m ? 'on' : ''} onClick={() => (ex.mode = m)}>
            {m === 'P' ? 'P · Power' : m === 'E' ? 'E · Ekonomi' : 'L · Heavy lift'}
          </button>
        ))}
      </div>
      <div className="row">
        <button className={ex.pmT > 0 ? 'on' : ''} onClick={() => powerMax(ex)}>
          Power Max {ex.pmT > 0 ? `${fmt(ex.pmT)} s` : '(Spasi)'}
        </button>
        <button className={ex.boomPower ? 'on' : ''} onClick={() => (ex.boomPower = !ex.boomPower)}>
          Boom: {ex.boomPower ? 'Power' : 'Smooth'}
        </button>
        <button className={ex.swingPriority ? 'on' : ''} onClick={() => (ex.swingPriority = !ex.swingPriority)}>
          Swing priority (O)
        </button>
        <button className={ex.travelHigh ? 'on' : ''} onClick={() => (ex.travelHigh = !ex.travelHigh)}>
          Travel {ex.travelHigh ? 'Hi 4,2' : 'Lo 2,8'} km/j (H)
        </button>
      </div>
      <p className="dim">Boom Smooth (bawaan Komatsu): tekanan boom-turun dibatasi, badan tidak terangkat saat bucket menekan tanah. Power: tenaga penuh, bisa mengangkat track (trik keluar dari lumpur atau menyeberang parit).</p>
      <h3>Pola joystick</h3>
      <div className="row">
        {(['ISO', 'SAE'] as const).map((p) => (
          <button key={p} className={ex.pattern === p ? 'on' : ''} onClick={() => (ex.pattern = p)}>
            {p}
          </button>
        ))}
      </div>
      <p className="dim">
        {ex.pattern === 'ISO'
          ? 'ISO (standar Komatsu): kiri = swing ↔ dan arm ↕ (maju keluar), kanan = boom ↕ (maju turun) dan bucket ↔ (kiri curl).'
          : 'SAE: kiri = swing ↔ dan boom ↕ (maju turun), kanan = arm ↕ (maju keluar) dan bucket ↔.'}
      </p>
    </>
  );
}

function MissionPanel() {
  useUI((s) => s.tick);
  return (
    <>
      <h3>Pilih pekerjaan</h3>
      <div className="loads">
        {JOBS.map((j) => (
          <button key={j.id} className={ex.job === j.id ? 'on' : ''} onClick={() => (ex.job = j.id)}>
            {j.name}
          </button>
        ))}
      </div>
      {JOBS.filter((j) => j.id === ex.job).map((j) => (
        <div key={j.id}>
          <p className="note">{j.text}</p>
          {j.link && (
            <p className="dim">
              Lanjutan cerita:{' '}
              <a href={j.link[1]} target="_blank" rel="noreferrer">
                {j.link[0]}
              </a>
            </p>
          )}
        </div>
      ))}
      {ex.job === 'rodeo' && (
        <button className="small" onClick={() => resetRodeo(ex)}>
          Mulai ulang Rodeo
        </button>
      )}
      <p className="dim">Machine guidance (G) mewarnai tanah: merah = masih harus digali, hijau = sesuai desain, biru = terlalu dalam.</p>
    </>
  );
}

function SetupPanel() {
  useUI((s) => s.tick);
  return (
    <>
      <h3>Attachment (quick coupler, di rak)</h3>
      <div className="row">
        {(['bucket', 'breaker', 'grapple'] as ToolId[]).map((tl) => (
          <button key={tl} className={ex.tool === tl ? 'on' : ''} onClick={() => swapTool(ex, tl)}>
            {tl === 'bucket' ? 'Bucket' : tl === 'breaker' ? 'Breaker' : 'Grapple'}
          </button>
        ))}
      </div>
      {ex.swapT > 0 && <p className="dim">Quick coupler bekerja… {fmt(ex.swapT)} s</p>}
      <h3>Undercarriage</h3>
      <div className="row">
        <button className={ex.under === 'track' ? 'on' : ''} onClick={() => setUnder(ex, 'track')}>
          Track standar
        </button>
        <button className={ex.under === 'pontoon' ? 'on' : ''} onClick={() => setUnder(ex, 'pontoon')}>
          Amfibi (ponton kustom)
        </button>
      </div>
      <h3>Arm (pilihan resmi Komatsu)</h3>
      <div className="row wrap">
        {(Object.keys(ARMS) as ArmId[]).map((a) => (
          <button key={a} className={ex.armId === a ? 'on' : ''} onClick={() => setArm(ex, a)}>
            {ARMS[a].name} · bucket {fmt(ARMS[a].bucket)} m³
          </button>
        ))}
      </div>
      <h3>Track shoe (double grouser)</h3>
      <div className="row">
        {([610, 810, 1010] as ShoeId[]).map((s) => (
          <button key={s} className={ex.shoe === s ? 'on' : ''} onClick={() => (ex.shoe = s)}>
            {s} mm · {SHOES[s].kpa} kPa
          </button>
        ))}
      </div>
      <p className="dim">Shoe lebar menurunkan tekanan tanah: track lebih sedikit amblas di gambut.</p>
      <h3>Lebar track (variable gauge)</h3>
      <div className="row">
        <button className={ex.gaugeWide ? 'on' : ''} onClick={() => setGauge(ex, true)}>
          Kerja 3 500 mm
        </button>
        <button className={!ex.gaugeWide ? 'on' : ''} onClick={() => setGauge(ex, false)}>
          Transport 3 390 mm
        </button>
      </div>
      <p className="dim">Berat operasi sekarang {t(machineMass(ex))} (brosur: 74,5 t dengan shoe 610 mm, arm 3,6 m, bucket 3,1 m³).</p>
    </>
  );
}

function ViewPanel() {
  const ui = useUI();
  return (
    <>
      <h3>Kamera (V)</h3>
      <div className="row wrap">
        {CAMS.map((c) => (
          <button key={c} className={ui.cam === c ? 'on' : ''} onClick={() => ui.set({ cam: c })}>
            {CAM_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="row">
        <button className={ui.guidance ? 'on' : ''} onClick={() => ui.set({ guidance: !ui.guidance })}>
          Machine guidance (G)
        </button>
      </div>
      <h3>Grafis</h3>
      <div className="row">
        <button className={!FULL ? 'on' : ''} onClick={() => FULL && setQuality(false)}>
          Mode ringan
        </button>
        <button className={FULL ? 'on' : ''} onClick={() => !FULL && setQuality(true)}>
          Mode penuh
        </button>
      </div>
      <h3>Cuaca dan X-ray</h3>
      <div className="row">
        <button className={ex.rain ? 'on' : ''} onClick={() => (setRain(ex, !ex.rain), ui.bump())}>
          Hujan {ex.rain ? 'ON' : 'OFF'}
        </button>
        <button className={ui.xray ? 'on' : ''} onClick={() => ui.set({ xray: !ui.xray })}>
          X-ray hidrolik (X)
        </button>
      </div>
      <p className="dim">Hujan: tanah licin, lereng lebih mudah longsor, air tanah naik dan galian tergenang. X-ray: aliran oli dari pompa ke silinder, warna = tekanan.</p>
      <h3>Waktu</h3>
      <div className="row">
        <button className={!NIGHT ? 'on' : ''} onClick={() => NIGHT && setNight(false)}>
          Siang
        </button>
        <button className={NIGHT ? 'on' : ''} onClick={() => !NIGHT && setNight(true)}>
          Malam
        </button>
      </div>
      <p className="dim">Ganti grafis atau waktu memuat ulang halaman.</p>
      <div className="row">
        <button
          onClick={() => {
            setSound(!soundOn());
            ui.bump();
          }}
        >
          Suara: {soundOn() ? 'aktif' : 'mati'}
        </button>
        <button onClick={() => ui.set({ help: true })}>Tombol</button>
      </div>
      <button className="small" onClick={resetAll}>
        Mulai ulang
      </button>
      {ui.started && !soundStatus.ok && soundStatus.text.startsWith('gagal') && <p className="snd bad">Suara: {soundStatus.text}</p>}
    </>
  );
}

function Panel() {
  const panel = useUI((s) => s.panel);
  const [tab, setTab] = useState('mesin');
  if (!panel) return null;
  return (
    <aside className="panel">
      <Tabs tab={tab} set={setTab} />
      {tab === 'mesin' && <EnginePanel />}
      {tab === 'misi' && <MissionPanel />}
      {tab === 'setup' && <SetupPanel />}
      {tab === 'tampil' && <ViewPanel />}
    </aside>
  );
}

/** The cab monitor: engine, mode, fuel, the bucket load, machine guidance, warnings. */
function Monitor() {
  useUI((s) => s.tick);
  const showGuide = useUI((s) => s.guidance);
  const g = guidance(ex);
  const kg = bucketKg(ex);
  const alarms: string[] = [];
  if (ex.locked) alarms.push('PPC LOCK');
  if (ex.relief) alarms.push('RELIEF');
  if (ex.lineDist < 3) alarms.push(`SUTM ${fmt(ex.lineDist)} m`);
  if (ex.spotter === 'stop') alarms.push('SPOTTER: STOP');
  else if (ex.spotter === 'pelan') alarms.push('SPOTTER: PELAN');
  if (ex.tilt > 0.17) alarms.push(`MIRING ${Math.round((ex.tilt * 180) / Math.PI)}°`);
  if (ex.fuelL < 60) alarms.push('SOLAR RENDAH');
  return (
    <section className="rcl" aria-label="Monitor">
      <header>
        <b>KOMATSU · monitor</b>
        <span className={ex.engine === 'running' ? 'ok' : ''}>{ex.engine === 'running' ? `${Math.round(ex.rpm)} rpm · ${ex.mode}` : 'mesin mati'}</span>
      </header>
      <div className="big">
        <div>
          <small>Isi bucket</small>
          <b>{fmt(ex.vol, 2)} m³</b>
        </div>
        <div>
          <small>Berat muatan</small>
          <b>{t(kg)}</b>
        </div>
        <div>
          <small>Kapasitas</small>
          <b>{fmt(bucketCap(ex))} m³</b>
        </div>
      </div>
      <div className="meter">
        <i style={{ width: `${Math.min(100, (ex.vol / bucketCap(ex)) * 100)}%`, background: ex.vol > bucketCap(ex) * 1.05 ? '#ffc21a' : '#2fd27a' }} />
      </div>
      <div className="grid">
        <span>
          Tanah <b>{ex.cutting > 0.02 ? SOIL[ex.cutSoil].name : '—'}</b>
        </span>
        <span>
          Kedalaman potong <b>{ex.cutting > 0.02 ? `${fmt(ex.cutting, 2)} m` : '—'}</b>
        </span>
        <span>
          Solar <b>{Math.round(ex.fuelL)} L</b>
        </span>
        <span>
          Beban mesin <b>{Math.round(ex.load * 100)}%</b>
        </span>
        <span>
          Tergali <b>{fmt(ex.stats.dugM3, 0)} m³</b>
        </span>
        <span>
          Kemiringan <b>{fmt((ex.tilt * 180) / Math.PI, 1)}°</b>
        </span>
      </div>
      {showGuide && g.delta !== null && (
        <div className="guide">
          <small>Ujung gigi vs desain</small>
          <b style={{ color: Math.abs(g.delta) <= 0.06 ? '#2fd27a' : g.delta > 0 ? '#ff6a4a' : '#5aa0ff' }}>
            {g.delta > 0 ? '▲ ' : g.delta < 0 ? '▼ ' : ''}
            {Math.abs(g.delta) < 10 ? `${Math.round(Math.abs(g.delta) * 100)} cm` : '—'}
          </b>
          <span>{Math.abs(g.delta) <= 0.06 ? 'SESUAI DESAIN' : g.delta > 0 ? 'di atas desain: gali lagi' : 'di bawah desain: terlalu dalam'}</span>
        </div>
      )}
      {alarms.length > 0 && (
        <div className="alarms">
          {alarms.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function hint() {
  if (ex.failed) return 'Kecelakaan. Tekan Mulai ulang (tab Tampilan).';
  if (ex.engine === 'off') return 'Hidupkan mesin: Enter (atau tombol di tab Mesin).';
  if (ex.locked) return 'Tuas pengunci PPC masih naik: tekan P supaya hidrolik aktif.';
  if (ex.spotter === 'stop') return 'Spotter memberi isyarat STOP: utilitas terkubur kurang dari 1 m dari bucket.';
  if (ex.lineDist < 3) return 'Terlalu dekat kabel listrik 20 kV: turunkan boom, jauhi kabel.';
  if (ex.job === 'truck') {
    const tr = ex.trucks.find((t) => t.state === 'wait');
    if (!tr) return 'Truk berikutnya sedang datang. Siapkan bucket penuh di bukit tanah (barat laut).';
    const pct = tr.kg / TRUCK.payloadKg;
    if (pct > 0.92) return `Truk ${Math.round(pct * 100)}%: cukup. Klakson (B) supaya berangkat.`;
    return `Truk menunggu: ${Math.round(pct * 100)}% (${tr.passes} bucket). Swing di atas bak, buka bucket pelan (joystick kanan ke kanan).`;
  }
  if (ex.job === 'breaker') return ex.tool !== 'breaker' ? 'Ke rak quick coupler (dekat titik awal), bawa ujung arm ke rak, pilih Breaker di tab Setup.' : 'Ke tebing batu (barat laut). Chisel tegak ke batu, boom tekan sedikit, tahan R.';
  if (ex.job === 'logs') return ex.tool !== 'grapple' ? 'Ganti ke grapple di rak quick coupler (tab Setup).' : 'Buka capit di atas kayu (R), turunkan, tutup (R), angkat, bawa ke lingkaran kuning.';
  if (ex.job === 'lowbed') return 'Lowbed di timur. Luruskan dengan ramp belakang, naik pelan (travel Lo), bucket rendah di depan untuk keseimbangan.';
  if (ex.job === 'amphib') return ex.under !== 'pontoon' ? 'Pasang undercarriage amfibi di tab Setup.' : 'Ke rawa di barat daya. Masuk air pelan, track mendayung, ke patok kuning di seberang.';
  if (ex.job === 'rodeo') return 'Arena Rodeo di utara. Bola ke drum, telur ke tiang (pelan!), ban ke lingkaran.';
  if (ex.job === 'trench') return 'Jalan ke patok merah muda (selatan). Gali sepanjang garis, pantau angka guidance sampai hijau.';
  if (ex.job === 'canal') return 'Ke blok gambut (barat daya). Kanal di antara patok hijau, timbun tanahnya di antara patok kuning.';
  if (ex.job === 'foundation') return 'Ke depan rumah genset (tenggara). Gali di antara patok biru sampai dasar rata hijau.';
  return 'Gali bebas. Joystick kiri: swing dan arm, kanan: boom dan bucket (ISO).';
}

function Mission() {
  useUI((s) => s.tick);
  const p = progress(ex);
  const j = JOBS.find((j) => j.id === ex.job)!;
  return (
    <section className="mission">
      <header>
        <b>{j.name}</b>
        <span>{Math.round(p.pct * 100)}%</span>
      </header>
      <p className="hint">{hint()}</p>
      <div className="mstats">
        <span>{p.text}</span>
      </div>
    </section>
  );
}

function Toast() {
  const { toast, toastUntil } = useUI();
  useUI((s) => s.tick);
  if (!toast || performance.now() > toastUntil) return null;
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  );
}

function Help() {
  const ui = useUI();
  if (!ui.help) return null;
  const list = (k: [string, string][]) => (
    <dl>
      {k.map(([a, b]) => (
        <div key={a}>
          <dt>{a}</dt>
          <dd>{b}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="help" role="dialog" aria-label="Tombol">
      <button className="x" onClick={() => ui.set({ help: false })} aria-label="Tutup">
        ×
      </button>
      <h3>Keyboard</h3>
      {list(KEYS)}
      <h3>Gamepad</h3>
      {list(PAD_KEYS)}
      <p className="credit">
        Data: brosur Komatsu PC800/800LC-8E0 (CEN00383): berat, mesin, pompa, relief, gaya gali, kecepatan swing dan travel, undercarriage, jangkauan kerja. Massa
        attachment, waktu siklus dan sifat tanah: perkiraan. Suara: rekaman diesel dan pompa hidrolik Komatsu 941 oleh Work With Sounds / Werstas (CC BY 4.0), start
        mesin oleh Evan0512 (CC BY-SA 4.0), Wikimedia Commons.
      </p>
    </div>
  );
}

function Stick({ onMove, label }: { onMove: (x: number, y: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState({ x: 0, y: 0 });
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    setK({ x, y });
    onMove(x, y);
  };
  const end = () => {
    setK({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={ref}
      className="stick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        touch.on = true;
        move(e);
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label={label}
    >
      <i style={{ transform: `translate(${k.x * 34}px, ${k.y * 34}px)` }} />
      <small>{label}</small>
    </div>
  );
}

function Hold({ label, set }: { label: string; set: (v: number) => void }) {
  return (
    <button onPointerDown={() => set(1)} onPointerUp={() => set(0)} onPointerLeave={() => set(0)} onPointerCancel={() => set(0)}>
      {label}
    </button>
  );
}

function Touch() {
  return (
    <div className="touch">
      <Stick label="joystick kiri" onMove={(x, y) => ((touch.lx = x), (touch.ly = -y))} />
      <div className="tped">
        <Hold label="Track kiri ▲" set={(v) => (touch.tl = v)} />
        <Hold label="Track kanan ▲" set={(v) => (touch.tr = v)} />
        <Hold label="Track kiri ▼" set={(v) => (touch.tl = -v)} />
        <Hold label="Track kanan ▼" set={(v) => (touch.tr = -v)} />
      </div>
      <Stick label="joystick kanan" onMove={(x, y) => ((touch.rx = x), (touch.ry = -y))} />
    </div>
  );
}

function Result() {
  useUI((s) => s.tick);
  if (!ex.failed) return null;
  const what = { tipped: 'Excavator terguling', utility: 'Utilitas terkubur rusak', powerline: 'Sengatan listrik 20 kV', truck: 'Kabin truk dihantam', '': '' }[ex.failed];
  return (
    <div className="result" role="alertdialog">
      <h2>⚠ {what}</h2>
      <p>Tergali {fmt(ex.stats.dugM3, 0)} m³ · truk {ex.stats.trucks} · benturan {ex.stats.hits}</p>
      <button className="big ok" onClick={resetAll}>
        Mulai ulang
      </button>
    </div>
  );
}

export function App() {
  const started = useUI((s) => s.started);
  useEffect(() => bindKeys(), []);
  return (
    <>
      <Experience />
      <FpsWarn />
      <Hud />
      {!started && <Intro />}
    </>
  );
}

/** Everything on screen over the 3D view; the Traknus World shows this while the player drives the excavator. */
export function Hud() {
  const panel = useUI((s) => s.panel);
  return (
    <>
      <header className="brand">
        <button className="menu" onClick={() => useUI.getState().set({ panel: !panel })} aria-label={panel ? 'Sembunyikan panel' : 'Tampilkan panel'}>
          {panel ? '◀' : '☰'}
        </button>
        <div>
          <h1>{SPEC.name}</h1>
          <p>Simulator excavator 80 t · tanah bisa digali · pola {ex.pattern}</p>
        </div>
      </header>
      <Panel />
      <Monitor />
      <Mission />
      <Toast />
      <Help />
      <Touch />
      <Result />
    </>
  );
}

function Intro() {
  return (
    <div className="intro">
      <div>
        <h1>Simulator Excavator Traknus</h1>
        <p>
          Komatsu PC800-8E0: 74,5 t, mesin 363 kW, boom 8,2 m, arm 3,6 m, bucket 3,1 m³, gaya gali 364 kN. Tanahnya benar-benar bisa digali: lempung, pasir,
          gambut basah, batu. Bucket terisi sesuai cara menggali, tanah longsor kalau terlalu curam, dan mesin bisa amblas, terangkat atau terguling.
        </p>
        <ol>
          <li>Hidupkan mesin (Enter), turunkan tuas pengunci (P bila terkunci).</li>
          <li>Joystick kiri W/S A/D, kanan I/K J/L (pola ISO), travel Q/Z dan E/C atau panah.</li>
          <li>Pilih pekerjaan di tab Misi: isi truk, parit dengan guidance, kanal sawit, pondasi genset.</li>
        </ol>
        <p className="dim">Keyboard + mouse, gamepad (dua stik = dua joystick), atau layar sentuh.</p>
        <button
          className="big ok"
          onClick={() => {
            void ensureAudio();
            useUI.getState().set({ started: true });
          }}
        >
          Mulai (suara aktif)
        </button>
      </div>
    </div>
  );
}
