# COMPOUND QA

สำหรับย้ายไปคอมเซิร์ฟเวอร์และอัปเดตจาก GitHub ให้เริ่มที่ [README-SERVER.md](README-SERVER.md) ชุดติดตั้งมี runtime พร้อมใช้ ส่วน GitHub เก็บเฉพาะซอร์สโค้ดและสร้างชุดอัปเดตผ่าน Release ไม่เก็บฐานข้อมูลหรือรหัสผ่าน

ระบบบันทึก QA ผ่าน QR Code สำหรับ AJ2 และ AJ2B ใช้ **React 19 + TypeScript + Vite + Tailwind CSS 4** ฝั่งเซิร์ฟเวอร์ใช้ Node.js 24 และ PostgreSQL

## เริ่มใช้งาน

เครื่องนี้ตั้ง PostgreSQL และย้ายข้อมูลเดิมแล้ว สำหรับเครื่องใหม่ เปิด `scripts/windows/SETUP-POSTGRESQL.cmd` ครั้งแรกก่อนรันเว็บ ดู [คู่มือ PostgreSQL](docs/POSTGRESQL.md)

- แก้ไขและดูผลทันที: เปิด **START-LOCAL-DEV.cmd** แล้วเข้า <http://localhost:5173>
- รันใช้งานจริง: เปิด **START-SERVER.cmd** แล้วเข้า <http://localhost:3000>
- คู่มือติดตั้ง สำรองข้อมูล และใช้งาน: [คู่มือ Windows](docs/README-WINDOWS.md)
- แนวทางเข้าจากนอกโรงงาน: [HTTPS](docs/HTTPS-ACCESS.md)

## โครงสร้าง

```text
src/
  main.tsx           จุดเริ่มต้น React
  app/               App และ useQaWorkspace ประสานสถานะ เซสชัน รอบผลิต และคิวรอส่ง
  features/          หน้าจอและองค์ประกอบ แยกตามงาน
    auth/            เข้าสู่ระบบหัวหน้า
    dashboard/       ภาพรวมการผลิต
    qa/              ฟอร์ม เตาอบ หอโรย และประวัติ QA
    rounds/          เลือกวันที่ เปิดรอบ และกรอกย้อนหลัง
    reports/         รายงานและสรุปผลผลิต
    alarms/          แจ้งเตือนและติดตามการแก้ไข
    qr/              พิมพ์ QR ประจำจุด
    settings/        แผนผลิต ผู้ใช้ และ Min/Max
    demo/            ข้อมูลตัวอย่าง แยกจากข้อมูลจริง
  shared/            กติกา QA, API, UI และตัวช่วยที่ใช้ร่วมกัน
  server/            HTTP, PostgreSQL, บัญชี QR และบริการบันทึกข้อมูล
  styles/            CSS แยกตามหน้าที่และธีม Tailwind
docs/                คู่มือระบบ
scripts/             Build, dev และเครื่องมือ Windows
migrations/          ประวัติโครงสร้างฐานข้อมูล
tests/               ทดสอบกติกา ข้อมูล สิทธิ์ และรายงาน
public/              ไอคอน manifest และ service worker
```

`dist/` เป็นไฟล์ที่สร้างจาก build ส่วน `data/` และ `data-dev/` เก็บไฟล์สำรองของแต่ละโหมด ข้อมูล PostgreSQL local อยู่ใน `.postgres/data` โฟลเดอร์เหล่านี้และ `node_modules/` ถูกซ่อนใน Explorer ของ VS Code เพื่อให้หาซอร์สง่ายขึ้น ไฟล์ยังอยู่ครบและเปิดดูจาก Windows Explorer ได้

## คำสั่งสำหรับพัฒนา

```sh
npm ci
npm run dev
npm run check
```

- `npm run format` จัดรูปแบบโค้ดด้วย Prettier
- `npm run typecheck` ตรวจ TypeScript
- `npm run check:architecture` ตรวจทิศทาง import ไม่ให้ UI ดึงโค้ดเซิร์ฟเวอร์ หรือ shared ดึงโค้ดหน้าจอ
- `npm test` สร้างเซิร์ฟเวอร์แล้วทดสอบด้วยschema PostgreSQL ชั่วคราว
- `npm run build` สร้าง `dist/client`, `dist/server` และ `dist/shared`
- `npm start` เริ่ม PostgreSQL local (ถ้าตั้งไว้) และเปิดเซิร์ฟเวอร์จากไฟล์ build โดยไม่ต้องมี dependencies ตอนรันจริง

แก้ซอร์สใน `src/` แล้ว build ใหม่ก่อนใช้ START-SERVER.cmd ระหว่างพัฒนา Vite อัปเดต React ทันทีและรีสตาร์ต API เมื่อโค้ดเซิร์ฟเวอร์หรือกติกาที่ใช้ร่วมกันเปลี่ยน

## แนวทางดูแลโค้ด

- เก็บหน้าจอและองค์ประกอบของงานเดียวกันใน feature เดียวกัน ใช้ UI และ API จาก `shared/`
- โค้ดใน `shared/` ห้าม import จาก `features/` หรือ `server/` เพื่อให้ใช้ได้ทั้ง browser และ Node
- เก็บการคำนวณและ validation ในกติกาที่ใช้ร่วมกัน ตรวจสิทธิ์และบันทึกข้อมูลจริงที่เซิร์ฟเวอร์เสมอ
- เพิ่ม migration ใหม่เมื่อต้องเปลี่ยน schema ห้ามแก้ migration ที่ใช้งานแล้ว
- ห้ามแก้ไฟล์ใน `dist/` โดยตรง และห้ามนำฐานข้อมูล รหัสผ่าน หรือไฟล์ `.env` ขึ้น Git หรือใส่ใน ZIP ส่งมอบ
- ใช้ Prettier ผ่าน `npm run format` หรือส่วนขยาย Prettier ใน VS Code; `npm run check` ต้องผ่านก่อนส่งมอบ

การสรุปและ Alarm ใช้กฎและสูตรตามที่ตกลง ยังไม่ได้เปิดใช้ AI หรือส่ง WhatsApp อัตโนมัติ ข้อมูล demo อยู่ใน browser แต่ข้อมูลจริงบันทึกใน PostgreSQL กลางของเซิร์ฟเวอร์
