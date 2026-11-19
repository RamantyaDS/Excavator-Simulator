# Simulator Excavator Traknus: Komatsu PC800-8

Simulator 3D excavator Komatsu PC800-8E0 (74,5 t) di browser: tanah yang benar-benar bisa digali, isi dump truck, parit dengan
machine guidance, kanal drainase kebun sawit, galian pondasi genset.

Live: https://ramantyads.github.io/Excavator-Simulator/

- Data mesin dari brosur resmi Komatsu PC800/800LC-8E0 (CEN00383): berat, mesin SAA6D140E-5 363 kW, pompa 2 × 494 L/min,
  relief 31,4 MPa, gaya gali bucket 364 kN / arm 273 kN (Power Max), swing 6,8 rpm, travel 2,8/4,2 km/j, undercarriage dan
  jangkauan kerja. Massa attachment, waktu siklus dan sifat tanah: perkiraan.
- Fisika: badan rigid 6-DOF di atas titik kontak track (gesekan, amblas di gambut), hidrolik dengan pembagian aliran, batas
  tenaga mesin, relief dan stall; bucket memotong sel tanah, terisi sesuai arah gali, tumpah bila dimiringkan; lereng longsor.
- Suara: rekaman diesel dan pompa hidrolik Komatsu 941 oleh Work With Sounds / Werstas (CC BY 4.0), start mesin oleh Evan0512
  (CC BY-SA 4.0), Wikimedia Commons.

Vite + React + TypeScript, three.js / react-three-fiber, zustand, vitest. `npm run dev`, `npm test`, `npm run build`.
