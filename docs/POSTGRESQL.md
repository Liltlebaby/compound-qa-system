# PostgreSQL สำหรับ COMPOUND QA

ระบบใช้ PostgreSQL เป็นฐานข้อมูลจริงทั้งหมด SQLite ใช้เฉพาะเครื่องมือนำเข้าข้อมูลเก่า ระบบจะไม่สลับกลับไป SQLite เมื่อ PostgreSQL เชื่อมต่อไม่ได้

## เครื่องที่กำลังพัฒนา

เตรียม PostgreSQL แบบ local ไว้ใน `.postgres/` แล้ว ฟังที่ `127.0.0.1:5432` และใช้การยืนยันตัวตน SCRAM บัญชีแอปไม่มีสิทธิ์ superuser, สร้างฐานข้อมูล หรือสร้าง role

- `compound_qa_dev`: ใช้กับ `npm run dev` / START-LOCAL-DEV.cmd
- `compound_qa`: ใช้กับ START-SERVER.cmd
- `.env.development.local` และ `.env.production.local`: การเชื่อมต่อแต่ละโหมด
- `.postgres/data`: ข้อมูล PostgreSQL จริง ห้ามลบหรือคัดลอกระหว่างรันเพื่อใช้แทน backup
- `.postgres/local.json`: ข้อมูลสำหรับดูแล cluster local ห้ามส่งต่อหรือใส่ Git
- `.postgres/runtime/bin`: เครื่องมือ pg_ctl, pg_dump และ pg_restore

ปุ่มรันทั้งสองแบบเริ่ม PostgreSQL local ให้อัตโนมัติเมื่อจำเป็น การปิดหน้าเว็บหรือ API ไม่ได้หยุดฐานข้อมูล ฐานข้อมูลเปิดเฉพาะ loopback มือถือเชื่อมต่อผ่านเว็บ/API ตามเดิม

## ลงบน Windows อีกเครื่อง

1. แตก ZIP ทั้งชุดและติดตั้ง Node.js 24
2. เปิด `scripts/windows/SETUP-POSTGRESQL.cmd` ครั้งแรก ต้องมีอินเทอร์เน็ตเพื่อดาวน์โหลด PostgreSQL binaries จาก EDB ประมาณ 385 MB
3. เครื่องมือสร้างฐานข้อมูลพัฒนา/ใช้งานจริงและรหัสผ่านสุ่มให้แยกกัน เก็บในไฟล์ local โดยไม่แสดงรหัสผ่าน
4. เปิด START-SERVER.cmd แล้วไป `http://localhost:3000/login` เพื่อตั้งหัวหน้า ถ้าต้องย้ายข้อมูลเดิมให้กู้คืน backup ก่อนเปิดใช้งานจริง
5. หากพัฒนาต่อ ให้ `npm ci` แล้วเปิด START-LOCAL-DEV.cmd

ZIP ไม่มีฐานข้อมูล บัญชี รหัสผ่าน หรือไฟล์ `.env` ติดไปด้วย PostgreSQL driver รวมอยู่ใน runtime ที่ build แล้ว จึงไม่ต้องลง npm dependencies เพื่อรันเซิร์ฟเวอร์จริง การตั้งค่า local จะไม่เขียนทับ cluster เดิมที่ตรวจพบ

## ใช้ PostgreSQL ที่ฝ่าย IT ติดตั้งไว้

ไม่ต้องใช้ตัวติดตั้ง local ตั้ง `DATABASE_URL` ในไฟล์โหมดที่ต้องการ และกำหนด `PG_BIN` เป็นโฟลเดอร์ที่มี pg_dump รุ่นเดียวกับหรือใหม่กว่าฐานข้อมูล ตัวอย่างอยู่ใน `docs/postgres-env.example.txt` ค่าจริงต้องเก็บในไฟล์ `.env.*.local` เท่านั้น

ผู้ใช้แอปต้องเป็นเจ้าของฐานข้อมูล/มีสิทธิ์สร้างและแก้ตารางใน schema ของแอปสำหรับ migration ไม่มีความจำเป็นต้องใช้ superuser ใช้ TLS ที่ตรวจใบรับรองสำหรับการเชื่อมต่อฐานข้อมูลต่างเครื่องตามการตั้งค่าของฝ่าย IT

## ย้าย SQLite เดิม

หยุดเว็บเซิร์ฟเวอร์ที่เขียน SQLite ก่อน และเตรียม PostgreSQL ปลายทางให้ว่าง จากนั้นบนเครื่องพัฒนา:

```sh
npm ci
npm run db:import-sqlite -- data-dev/compound-qa.sqlite --development
```

สำหรับฐานข้อมูลใช้งานจริง ให้เอา `--development` ออกและระบุไฟล์ต้นทางที่ต้องการ เครื่องมือสำรอง SQLite ก่อนเริ่ม เปิดต้นฉบับแบบ read-only และทำการนำเข้าใน transaction เดียว เปรียบเทียบจำนวนและ hash เนื้อหาทุกแถวทุกตาราง หากไม่ตรงจะ rollback การรันซ้ำต้นฉบับเดิมไม่สร้างข้อมูลซ้ำ และจะปฏิเสธปลายทางที่มีข้อมูลอื่นอยู่แล้ว

คงรูป JSON และเวลา ISO ของข้อมูลเก่าไว้เป็นข้อความ เพื่อรักษา snapshot รายงานและ fingerprint เดิม ใช้ฟังก์ชัน JSONB ของ PostgreSQL เมื่อต้องประมวลผล และมีดัชนีตามโรง/กะ/วันที่/รอบ/จุดตรวจ

## สำรองและกู้คืน

ระบบเรียก pg_dump เป็นไฟล์ `.dump` ทุกชั่วโมงเมื่อมีบัญชีหัวหน้าแล้ว เก็บสูงสุด 168 ไฟล์ใน `data/backups` หรือ `data-dev/backups` ตามโหมด เก็บ SQLite backup เก่าแยกไว้ การสำรองที่ไม่สำเร็จจะไม่แสดงเป็นไฟล์สำเร็จ

สำรองด้วยมือ:

```sh
npm run db:backup
```

คำสั่งนี้ใช้ฐาน production เป็นค่าเริ่มต้น สำหรับ dev ให้กำหนด `QA_ENV=development` ก่อน ต้องนำสำเนา backup ออกไปอีกดิสก์หรือระบบสำรองของโรงงานด้วย

กู้คืนด้วย pg_restore ไปยัง **ฐานข้อมูลใหม่ที่ว่าง** ใช้ `--no-owner --no-privileges --exit-on-error` และกำหนดการเชื่อมต่อผ่าน PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE โดยไม่ใส่รหัสผ่านใน command line หรือแชต ตรวจจำนวนรายการและเปิดรายงานก่อนเปลี่ยน DATABASE_URL ไปฐานที่กู้คืน ห้าม restore ทับฐานที่กำลังใช้งาน

## ตรวจสอบ

`npm run check` ตรวจรูปแบบ TypeScript ขอบเขตโมดูล ทดสอบกติกา และ build ชุดทดสอบ integration ใช้ PostgreSQL จริงและสร้าง schema ชั่วคราวชื่อ `qa_test_*` แล้วลบทิ้งเมื่อจบ ไม่ใช้ข้อมูล QA จริงในการทดสอบ

ทดสอบเพิ่มสำหรับ transaction rollback, สแกน QR พร้อมกัน, ส่ง request ซ้ำ, แก้รุ่นเดียวกันพร้อมกัน, สร้างรายงานพร้อมกัน, นำเข้า SQLite ซ้ำ และ pg_dump/pg_restore

อ้างอิง: [PostgreSQL Windows](https://www.postgresql.org/download/windows/), [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries), [node-postgres transactions](https://node-postgres.com/features/transactions)
