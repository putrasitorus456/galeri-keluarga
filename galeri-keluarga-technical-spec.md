# Family Photo PWA — Technical Specification

## 1. Tujuan

Bangun sebuah **Progressive Web App (PWA)** sederhana yang menjadi perantara antara Google Drive pemilik aplikasi dan HP orang tua.

Tujuan utama aplikasi:

- Orang tua dapat membuka aplikasi tanpa perlu memahami Google Drive.
- Orang tua dapat melihat foto dan video dalam bentuk galeri/album.
- Orang tua dapat membuka foto/video dalam tampilan yang nyaman di HP.
- Orang tua dapat mengunduh foto/video ke HP dengan satu tombol.
- Orang tua tidak perlu login ke akun Google pemilik Drive.
- Credential Google Drive tidak boleh pernah dikirim ke browser.
- Aplikasi harus terasa seperti aplikasi HP, tetapi tetap merupakan web app/PWA.

**Prinsip desain paling penting:**

> Simpel, mudah, jelas, dan straight-forward. Jangan membuat UI terasa seperti Google Drive.

Google Drive hanya berfungsi sebagai **storage layer**. PWA adalah **presentation layer**.

---



## 2. Target User

Target user hanya anggota keluarga, terutama orang tua.

Asumsi penggunaan:

- Mayoritas menggunakan HP Android.
- Tidak diasumsikan mengerti folder/file ID.
- Tidak diasumsikan nyaman dengan banyak menu.
- Sering menggunakan aplikasi sederhana seperti WhatsApp/Gallery.
- Membutuhkan tombol dan teks yang mudah dipahami.

Karena aplikasi bersifat pribadi, tidak diperlukan sistem user/account yang kompleks.

---



## 3. Scope



### Wajib

1. Halaman akses/login sederhana menggunakan PIN aplikasi. Tidak perlu username dan password, hanya pin.
2. Halaman utama berisi daftar album/folder.
3. Membuka album.
4. Menampilkan foto dan video dalam grid. Tersedia filter untuk hanya menampilkan foto atau video.
5. Preview foto fullscreen. Jika foto diklik.
6. Pemutaran video dan fullscreen. Jika video diklik.
7. Download foto. Single or bulk.
8. Download video. Single or bulk.
9. Tombol share yang men-generate link ke sebuah foto dan hanya bisa diakses oleh orang yang memiliki aplikasi yang sama.
10. Tombol kembali yang jelas.
11. Loading state.
12. Empty state.
13. Error state.
14. PWA dapat ditambahkan seperti aplikasi HP.
15. Responsive/mobile-first.
16. Backend terintegrasi dengan Google Drive API.
17. Google Drive credentials hanya berada di server.



### Jangan dibuat untu sekarang

- Upload file.
- Delete file.
- Edit file.
- Rename file.
- Admin dashboard.
- Multi-user account.
- Chat.
- Comment.
- Like/favorite.
- Push notification.
- Search global yang kompleks.
- Integrasi storage lain.
- Social feed.
- Fitur editing foto/video.

Fokus hanya pada:

> **Buka → pilih album → pilih foto/video → lihat → download/share.**

---



## 4. UX yang Diinginkan



### 4.1 Home

Saat membuka aplikasi, tampilkan:

```text
Foto Keluarga

Pilih album

[ Liburan 2026 ]
[ Lebaran 2026 ]
[ Keluarga ]
[ Acara ]
[ Video ]
```

Gunakan card yang besar dan mudah disentuh.

Hindari sidebar kompleks.

Header cukup:

```text
Foto Keluarga
```

dan bila diperlukan tombol kecil untuk refresh.

---



### 4.2 Album

Contoh:

```text
← Liburan 2026

┌───────┬───────┬───────┐
│ foto  │ foto  │ video │
├───────┼───────┼───────┤
│ foto  │ foto  │ foto  │
├───────┼───────┼───────┤
│ foto  │ video │ foto  │
└───────┴───────┴───────┘
```

Grid harus responsif:

- Mobile: 3 kolom.
- Tablet: 4 kolom.
- Desktop: 5–6 kolom.

Thumbnail memakai `object-cover`.

Video harus memiliki indikator play sederhana di thumbnail.

---



### 4.3 Preview Foto

Ketika foto dipilih:

```text
┌────────────────────────┐
│ ←                      │
│                        │
│        [ FOTO ]        │
│                        │
│                        │
│                        │
│  [ Download ] [ Share ]│
└────────────────────────┘
```

Prioritas:

1. Foto besar.
2. Download.
3. Share.
4. Kembali.

Hindari metadata teknis seperti MIME type atau file ID.

---



### 4.4 Preview Video

Gunakan native HTML5 `<video controls>`.

Tampilkan tombol:

```text
[ Download ]
[ Share ]
```

Video tidak perlu di-autoplay. Sediakan saja tombol play.

---



## 5. Security Model

Gunakan model **single-owner**.

Tidak ada Google OAuth di sisi orang tua.

### Arsitektur akses

```text
Parent Phone
     |
     | HTTPS
     v
   PWA
     |
     | API
     v
  Server
     |
     | Google Drive API
     v
 Google Drive Owner
```

Credential Google Drive hanya berada di backend.

### App PIN

Tambahkan PIN sederhana untuk membatasi akses aplikasi.

Contoh:

```text
Masukkan PIN

[  •  •  •  •  ]

[ Masuk ]
```

Setelah berhasil:

- server membuat signed session cookie;
- browser tidak menyimpan Google credential;
- user tidak perlu memasukkan PIN setiap kali selama session masih valid.

PIN disimpan hanya sebagai environment variable atau hashed secret di server. Jangan hard-code PIN di frontend.

Recommended:

```env
APP_PIN_HASH=...
SESSION_SECRET=...
```

Gunakan signed/encrypted HTTP-only cookie.

Cookie:

- `httpOnly=true`
- `secure=true` pada production
- `sameSite=lax`
- `path=/`

Jangan simpan session token di `localStorage`.

---



## 6. Google Drive Integration

Gunakan **Google Drive API v3**.

API mendukung `files.list` untuk mencari file/folder dan `files.get` dengan `alt=media` untuk mengambil isi file blob seperti foto/video. Google juga menyediakan `capabilities.canDownload` untuk memeriksa apakah file boleh di-download.

Referensi resmi:

- [https://developers.google.com/workspace/drive/api/guides/search-files](https://developers.google.com/workspace/drive/api/guides/search-files)
- [https://developers.google.com/workspace/drive/api/guides/manage-downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads)



### Recommended authentication

Untuk aplikasi personal/single-owner, gunakan **Google Service Account** di backend.

Share folder root di Google Drive kepada email Service Account dengan akses read-only.

Jangan membuat seluruh Google Drive public.

Contoh:

```text
My Drive
└── Family Photo
    ├── Liburan 2026
    ├── Lebaran 2026
    ├── Keluarga
    └── Video
```

Hanya folder `Family Photo` yang dibagikan ke Service Account.

Simpan folder root ID sebagai:

```env
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
```



### Kenapa root folder?

Backend hanya boleh membaca isi folder yang ditentukan oleh `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

Jangan memberikan endpoint yang menerima sembarang `fileId` lalu mengambil file apa pun dari Drive.

---



## 7. Struktur Data Google Drive

Folder langsung di dalam root dianggap sebagai **album**.

Contoh:

```text
Family Photo/
├── Liburan 2026/
│   ├── IMG_001.jpg
│   ├── IMG_002.jpg
│   └── VID_001.mp4
│
├── Lebaran 2026/
│   ├── IMG_010.jpg
│   └── IMG_011.jpg
│
└── Keluarga/
    ├── IMG_100.jpg
    └── IMG_101.jpg
```

Tidak perlu database untuk struktur ini.

Google Drive tetap menjadi source of truth.

---



## 8. File Type Support



### Supported

Image:

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`
- `image/heic`
- `image/heif`
- `image/heic-sequence`
- `image/heif-sequence`

HEIC/HEIF dikonversi ke JPEG saat preview di browser (Chrome/Android tidak menampilkan HEIC mentah). Download tetap memakai file asli.

Video:

- `video/mp4`
- `video/webm`
- `video/quicktime`
- `video/x-matroska` bila browser target mendukung



### Unsupported

Untuk saat ini, file selain image/video jangan ditampilkan.

Filter file berdasarkan MIME type.

---



## 10. PWA

Aplikasi harus installable dan memiliki pengalaman seperti aplikasi native.

Gunakan:

- Web App Manifest.
- Service Worker.
- HTTPS production.
- `display: standalone`.
- Mobile-first viewport.
- App icons minimal 192x192 dan 512x512.
- Offline fallback.

PWA dapat dibuat menggunakan solusi PWA yang aktif dan kompatibel dengan versi Next.js yang digunakan. **Gunakan** `@serwist/next` **bila kompatibel dengan setup proyek.** Jangan memakai dependency PWA yang sudah deprecated hanya karena tutorial lama.

Referensi:

- [https://web.dev/explore/progressive-web-apps](https://web.dev/explore/progressive-web-apps)
- [https://web.dev/learn/pwa](https://web.dev/learn/pwa)
- [https://serwist.pages.dev/docs/next](https://serwist.pages.dev/docs/next)

Manifest target:

```json
{
  "name": "Foto Keluarga",
  "short_name": "Foto Keluarga",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait"
}
```

---



## 11. Offline Strategy

Jangan mencoba membuat semua foto/video offline.

Foto dan video dari Google Drive tetap membutuhkan internet.

Yang boleh di-cache:

- application shell;
- CSS;
- JavaScript;
- icons;
- fonts;
- static UI;
- offline fallback page;
- metadata album secara ringan jika aman.

Jangan precache video atau file foto berukuran besar.

Saat offline:

```text
Tidak ada koneksi internet.

Foto dan video membutuhkan koneksi internet.
Silakan coba lagi setelah terhubung.
```

PWA tetap bisa dibuka dan menampilkan halaman offline yang sederhana.

---



## 12. UI Design Rules

Desain harus terasa seperti aplikasi keluarga, bukan dashboard developer.

### Typography

Gunakan font sans-serif yang mudah dibaca.

### Buttons

Minimum touch target sekitar 44–48px.

Tombol utama:

- besar;
- rounded;
- text jelas;
- icon + label jika memungkinkan.

Contoh:

```text
[ ↓ Download ]
```

lebih baik daripada hanya:

```text
[ ↓ ]
```

untuk user lansia/non-teknis.

### Navigation

Gunakan:

```text
← Kembali
```

daripada breadcrumb kompleks.

### Color

Gunakan palette sederhana.

Contoh:

- background: white / very light gray;
- text: dark gray;
- primary: satu accent color;
- destructive colors tidak diperlukan.



### Spacing

Beri ruang cukup besar antar elemen.

---



## 13. Responsive Layout

Mobile harus menjadi prioritas.

### Mobile

```text
width < 640px
```

Grid:

```text
3 columns
```



### Tablet

```text
640px – 1024px
```

Grid:

```text
4 columns
```



### Desktop

```text
> 1024px
```

Grid:

```text
5–6 columns
```

Tetapi jangan membuat desktop menjadi layout yang berbeda total.

Aplikasi tetap berupa gallery sederhana.

---



## 14. Performance

Jangan memuat file full-resolution untuk thumbnail gallery.

Prioritas:

1. Thumbnail.
2. Full image hanya saat viewer dibuka.
3. Video stream hanya saat video dibuka.
4. Lazy load media.
5. Jangan preload semua video.
6. Gunakan pagination jika folder sangat besar.

Untuk album kecil:

```text
pageSize = 50
```

Untuk album besar, gunakan pagination.

---



## 15. Error Handling

Gunakan pesan yang dimengerti user.

### Network

```text
Tidak dapat terhubung ke internet.

Coba lagi.
```



### Unauthorized

```text
Sesi Anda sudah berakhir.

Silakan masuk kembali.
```



### Google Drive unavailable

```text
Foto sedang tidak dapat dimuat.

Coba lagi beberapa saat lagi.
```



### File unavailable

```text
Foto/video ini tidak dapat dibuka.
```

Jangan tampilkan stack trace kepada user.

---



## 16. Loading State

Saat album loading, gunakan skeleton.

Contoh:

```text
┌───────┬───────┬───────┐
│ ░░░░░ │ ░░░░░ │ ░░░░░ │
├───────┼───────┼───────┤
│ ░░░░░ │ ░░░░░ │ ░░░░░ │
└───────┴───────┴───────┘
```

Jangan hanya menampilkan blank screen.

---



## 17. Empty State

Jika album kosong:

```text
Belum ada foto di album ini.
```

Tidak perlu tombol/fitur tambahan.

---



## 18. Sorting

Untuk album:

- folder lebih dulu bila nested folder didukung;
- file setelahnya.

Untuk file:

Default:

```text
modifiedTime descending
```

Tetapi untuk foto keluarga, boleh menggunakan:

```text
createdTime / modifiedTime descending
```

Pilih satu konsisten.

---



## 19. Refresh

Tambahkan tombol refresh kecil pada home/album.

Contoh:

```text
Foto Keluarga             ↻
```

Saat ditekan:

```text
invalidate cache
↓
fetch ulang Google Drive
```

---



## 20. PWA Installation UX

Setelah aplikasi berjalan dengan baik, tambahkan prompt ringan:

```text
Tambahkan aplikasi ke layar utama?

[ Tambahkan ]
[ Nanti ]
```

Namun jangan langsung menampilkan modal setiap kali membuka aplikasi.

Simpan status dismissal secara lokal.

Pada browser yang tidak mendukung install prompt, jangan tampilkan pesan palsu.

---



## 21. Accessibility

Wajib:

- semantic HTML;
- `alt` pada image;
- keyboard navigation untuk desktop;
- focus state;
- tombol dengan aria-label bila hanya berupa icon;
- contrast yang cukup;
- touch target besar.

Contoh:

```tsx
<button aria-label="Kembali">
  ←
</button>
```

---



## 22. Browser Support

Prioritas:

1. Android Chrome.
2. iPhone Safari.
3. Desktop Chrome.

Jangan mengorbankan simplicity untuk browser legacy.

---



## 23. Acceptance Criteria

Aplikasi dianggap selesai bila semua skenario berikut berjalan.

### Access

- [ ] User membuka PWA.
- [ ] User melihat halaman PIN.
- [ ] PIN benar → masuk.
- [ ] PIN salah → tampil error.
- [ ] Session tetap aktif setelah refresh.



### Home

- [ ] Album dari root Google Drive muncul.
- [ ] Album memiliki nama yang mudah dibaca.
- [ ] Album dapat dibuka.



### Album

- [ ] Foto muncul sebagai thumbnail.
- [ ] Video memiliki indikator video.
- [ ] Grid responsive.
- [ ] Loading state muncul saat fetch.
- [ ] Empty state bekerja.



### Photo

- [ ] Foto dapat dibuka fullscreen.
- [ ] Foto dapat di-download.
- [ ] Foto dapat di-share.



### Video

- [ ] Video dapat diputar.
- [ ] Video dapat seek.
- [ ] Video dapat di-download.
- [ ] Video tidak autoplay.
- [ ] Video dapat dishare.



### PWA

- [ ] Manifest tersedia.
- [ ] Service worker terdaftar.
- [ ] App dapat di-install.
- [ ] App terbuka standalone.
- [ ] Offline fallback tersedia.



### Security

- [ ] Google credential tidak terlihat di browser.
- [ ] API tanpa session ditolak.
- [ ] File di luar root folder ditolak.
- [ ] Arbitrary Google Drive URL tidak dapat digunakan.

---



## 24. Cursor Instructions

Cursor harus mengerjakan aplikasi dengan prinsip berikut:

### Principle 1 — Jangan over-engineer

Ini aplikasi pribadi keluarga.

Jangan membuat:

- microservices;
- database kompleks;
- authentication provider;
- admin dashboard;
- state management global yang tidak diperlukan;
- abstraction berlebihan.



### Principle 2 — Security over convenience

Google credential harus tetap server-side.

### Principle 3 — UX over features

Bila harus memilih antara fitur tambahan dan UX yang lebih sederhana, pilih UX.

### Principle 4 — Mobile first

Semua keputusan UI harus dimulai dari HP.

### Principle 5 — Use Google Drive as source of truth

Jangan menduplikasi file ke database/object storage.

### Principle 6 — Keep API normalized

Frontend menerima object sederhana seperti:

```ts
type Album = {
  id: string
  name: string
  thumbnailUrl?: string
}

type MediaItem = {
  id: string
  name: string
  type: "image" | "video"
  mimeType: string
  thumbnailUrl: string
  previewUrl: string
  downloadUrl: string
}
```

Jangan expose raw Google Drive response ke frontend.

---



## 25. Official Technical References

Google Drive API:

- Search files/folders: [https://developers.google.com/workspace/drive/api/guides/search-files](https://developers.google.com/workspace/drive/api/guides/search-files)
- Download/export files: [https://developers.google.com/workspace/drive/api/guides/manage-downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- File permissions: [https://developers.google.com/workspace/drive/api/guides/manage-sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing)
- Drive API quotas: [https://developers.google.com/workspace/drive/api/guides/limits](https://developers.google.com/workspace/drive/api/guides/limits)

PWA:

- PWA overview: [https://web.dev/explore/progressive-web-apps](https://web.dev/explore/progressive-web-apps)
- Learn PWA: [https://web.dev/learn/pwa](https://web.dev/learn/pwa)
- Serwist + Next.js: [https://serwist.pages.dev/docs/next](https://serwist.pages.dev/docs/next)

---



# Final Product Vision

Produk akhirnya harus terasa seperti:

```text
Google Drive
     ↓
    [Backend]
     ↓
┌─────────────────────┐
│   FOTO KELUARGA     │
│                     │
│   Liburan           │
│   Lebaran           │
│   Keluarga          │
│   Acara             │
│                     │
│   📷 📷 🎥 📷       │
│   📷 🎥 📷 📷       │
│                     │
│   [ Download ]      │
└─────────────────────┘
```

Bukan seperti:

```text
Dashboard
Sidebar
Files
Settings
Permissions
API
Metadata
...
```

**Kesederhanaan adalah requirement utama, bukan sekadar preferensi desain.**