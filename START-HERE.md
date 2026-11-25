# เริ่มต้นจากซอร์สโค้ด COMPOUND QA v1.0.1

ชุดนี้มีซอร์สโค้ด React และ Node.js, migration สำหรับ PostgreSQL, assets, tests และสคริปต์ Windows กับ GitHub Actions

## รันบน Windows จากซอร์สโค้ด

1. ติดตั้ง Node.js 24 และแตก ZIP ลงในโฟลเดอร์ที่เขียนได้
2. เปิด Command Prompt ในโฟลเดอร์ที่มี `package.json` แล้วรันคำสั่งตามลำดับ

   ```bat
   npm ci
   npm run build
   npm run db:setup
   ```

   `npm ci` ติดตั้ง dependencies ตาม lockfile และ `npm run db:setup` เตรียม PostgreSQL local บน Windows ทั้งสองขั้นตอนต้องเข้าถึงแหล่งดาวน์โหลดของโปรแกรม หากเครื่องมี PostgreSQL ที่ใช้งานอยู่ ให้ฝ่าย IT ตรวจพอร์ตและอ่าน [คู่มือฐานข้อมูล](docs/POSTGRESQL.md) ก่อนตั้งค่า

3. พัฒนาต่อด้วย `START-LOCAL-DEV.cmd` แล้วเปิด <http://localhost:5173/?demo=1>
4. สำหรับเครื่องเซิร์ฟเวอร์ที่ติดตั้งจากซอร์ส ให้เปิด `SETUP-SERVER.cmd` แล้ว `START-SERVER.cmd` ตามลำดับ จากนั้นเปิด <http://localhost:3000/login> สำหรับฐานใหม่ให้ตั้งบัญชีผู้ดูแลครั้งแรก หากย้ายข้อมูลเดิมให้กู้ไฟล์สำรองก่อนใช้งานตาม [คู่มือเซิร์ฟเวอร์](README-SERVER.md)

## ไฟล์ข้อมูลและการติดตั้ง

ชุดซอร์สมี `package-lock.json` สำหรับติดตั้ง dependencies และมีตัวอย่างค่าตั้งใน `docs/` ไฟล์ `.env` ฐานข้อมูลเดิม รหัสผ่าน `node_modules` และไฟล์ที่ build แล้วเก็บแยกจากซอร์ส หากต้องย้ายพร้อมข้อมูลเดิม ให้ใช้ชุดส่งมอบ IT หรือ backup ที่ฝ่าย IT ได้รับผ่านช่องทางของบริษัท
