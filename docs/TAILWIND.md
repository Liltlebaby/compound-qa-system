# React + Tailwind CSS

หน้าเว็บใช้ React 19, TypeScript, Vite และ Tailwind CSS 4 ผ่าน `@tailwindcss/vite`

## ติดตั้งและเปิดใช้งาน

หลังอัปเดตโค้ด ให้ติดตั้งแพ็กเกจใหม่บนเครื่องที่เชื่อมต่อ npm ได้:

```powershell
npm install
npm run typecheck
npm run build
```

`npm install` จะอัปเดต `package-lock.json` พร้อมแพ็กเกจ Tailwind และ dependencies ให้ครบ ก่อนใช้ `npm ci` บนเครื่องอื่น

พัฒนาโดยใช้ `npm run dev` หรือเปิด `START-LOCAL-DEV.cmd` ซึ่งตรวจแพ็กเกจ Tailwind ก่อนเริ่มทำงาน ส่วนเซิร์ฟเวอร์ใช้งานจริงเปิดด้วย `START-SERVER.cmd` หลัง build แล้วตามเดิม

## แนวทางเขียนสไตล์

- `src/styles/tailwind.css` กำหนดสี ฟอนต์ มุมโค้ง และเงาที่ใช้ร่วมกัน
- ใช้ utility ที่ขึ้นต้นด้วย `tw:` ใน React เช่น `tw:flex tw:gap-[12px] tw:bg-brand` เพื่อไม่ให้ชื่อชนกับคลาสเดิม เช่น `outline`
- `src/features/auth/LoginPage.tsx` ใช้ utilities โดยตรง พร้อมระยะห่างที่ปรับตามขนาดหน้าจอ
- `src/styles/base.css` ใช้ `@apply` ประกอบปุ่ม ป้ายสถานะ ข้อความแจ้งเตือน การ์ด และส่วนฟอร์มจาก Tailwind
- สไตล์เฉพาะงาน เช่น ตาราง QA และรายงานพิมพ์ ยังคงเป็น CSS ภายใน layer `components` และ utilities สามารถปรับทับได้
- ใช้ base styles เดิมโดยไม่เปิด Preflight เพื่อคงรูปแบบช่องกรอก dialog และเอกสารพิมพ์

Tailwind ถูก compile เป็น CSS ในขั้นตอน build จึงไม่ต้องโหลด Tailwind จาก CDN ระหว่างใช้งาน

## ตรวจสอบโค้ด

ใช้ `npm run check` เพื่อตรวจรูปแบบ TypeScript ทดสอบกติกา QA และ build React/Tailwind พร้อมเซิร์ฟเวอร์
