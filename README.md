# Album Kita

PWA sederhana agar orang tua bisa melihat dan mengunduh foto/video dari Google Drive tanpa login akun Google.

Google Drive hanya dipakai sebagai tempat penyimpanan. PIN aplikasi melindungi akses. Kredensial Google tetap di server.

## Persyaratan

- Node.js 20 atau lebih baru
- Folder Google Drive (contoh: `Family Photo`) yang berisi album sebagai subfolder
- Google Cloud project dengan Drive API

## Setup Google Drive

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project, lalu aktifkan **Google Drive API**.
3. Buat **Service Account**, unduh JSON key.
4. Di Google Drive, bagikan folder root (contoh `Family Photo`) ke email Service Account dengan akses **Viewer**.
5. Buka folder tersebut, salin ID dari URL:

```text
https://drive.google.com/drive/folders/FOLDER_ID_INI
```

Isi `GOOGLE_DRIVE_ROOT_FOLDER_ID` dengan ID itu.

Hanya folder langsung di dalam root yang tampil sebagai album. File di luar folder itu ditolak server.

## Setup lokal

```bash
npm install
cp .env.example .env.local
```

Buat hash PIN (jangan taruh PIN mentah di frontend):

```bash
npm run hash-pin -- 1234
```

Salin baris `APP_PIN_HASH=base64:...` ke `.env.local` atau ke environment Railway. Format `base64:` menghindari tanda `$` pada hash bcrypt yang bisa rusak saat file `.env` dimuat.

Buat `SESSION_SECRET` acak, minimal 32 karakter. Contoh di PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

Isi kredensial Service Account:

- `GOOGLE_SERVICE_ACCOUNT_JSON` berisi isi file JSON, **atau** path ke file JSON di komputer Anda
- atau pasangan `GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Jalankan aplikasi:

```bash
npm run generate-icons
npm run dev
```

Buka `http://localhost:3000`. Masukkan PIN, lalu pilih album.

Service worker PWA hanya aktif di production (`npm run build` lalu `npm run start`).

## Deploy ke Railway

1. Push repo ke GitHub.
2. Buat project Railway dari repo itu.
3. Set environment variables yang sama seperti `.env.example`.
4. Pastikan `SESSION_SECRET` kuat, dan `NODE_ENV=production`.
5. Build: `npm run build`. Start: `npm run start` (server standalone di `0.0.0.0`).

Railway (atau Fly.io / VPS) lebih cocok daripada Vercel Hobby karena video di-stream lewat server.

Setelah domain HTTPS aktif, orang tua bisa membuka situs lalu **Tambahkan ke layar utama** di Chrome Android.

## Perintah

```bash
npm run dev          # development
npm run build        # production build + service worker
npm run start        # jalankan hasil build
npm run hash-pin     # buat APP_PIN_HASH
npm run generate-icons
```

Jangan commit file `.env.local`, JSON key Service Account, atau secret lain.
