# 🚀 Production Deployment Checklist

## ก่อน Deploy ต้องทำเหล่านี้:

### 1. รัน SQL Scripts ใน Supabase SQL Editor

รันตามลำดับ:
```
1. database/schema.sql         (ถ้ายังไม่มี tables)
2. database/indexes.sql        (เพิ่ม indexes)
3. database/topup_requests.sql (ระบบ topup ใหม่)
4. database/stock_functions.sql (ป้องกัน race condition)
5. database/audit_logs.sql     (ระบบ Audit Logging) ⭐ NEW
```

### 2. ตั้งค่า Environment Variables

ใน `.env` หรือ hosting platform:

```bash
# จำเป็น (Production จะไม่รันถ้าไม่มี)
NODE_ENV=production
SESSION_SECRET=<random-string-อย่างน้อย-32-ตัวอักษร>
DISCORD_CLIENT_ID=<จาก Discord Developer Portal>
DISCORD_CLIENT_SECRET=<จาก Discord Developer Portal>
DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
SUPABASE_URL=<จาก Supabase Project Settings>
SUPABASE_ANON_KEY=<จาก Supabase>
SUPABASE_SERVICE_KEY=<จาก Supabase>
ADMIN_IDS=<Discord ID ของ Admin, คั่นด้วย comma>
```

สร้าง SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. ตรวจสอบ Discord OAuth

1. ไปที่ https://discord.com/developers/applications
2. เลือก Application > OAuth2
3. เพิ่ม Redirect URL: `https://yourdomain.com/auth/discord/callback`
4. ตรวจสอบ Scopes: `identify`, `email`, `guilds`

### 4. ตรวจสอบ HTTPS

- Production ต้องใช้ HTTPS เท่านั้น
- Cookie จะถูกตั้งค่า `secure: true` โดยอัตโนมัติ

### 5. ตรวจสอบ Supabase RLS

ตรวจสอบว่า Row Level Security เปิดใช้งานทุก table:
```sql
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';
```

---

## 📋 สิ่งที่แก้ไขแล้ว

| ปัญหา | สถานะ | รายละเอียด |
|-------|-------|------------|
| Topup ไม่มี verification | ✅ แก้แล้ว | ต้อง Admin approve ก่อนเงินเข้า |
| Race Condition ใน Stock | ✅ แก้แล้ว | ใช้ PostgreSQL FOR UPDATE SKIP LOCKED |
| ไม่มี DB Transaction | ✅ แก้แล้ว | ทุกอย่างใน stored procedure เดียว |
| Session Secret ไม่ปลอดภัย | ✅ แก้แล้ว | บังคับตั้งใน Production |
| N+1 Query | ✅ แก้แล้ว | ใช้ single query + grouping |
| ไม่มี Caching | ✅ แก้แล้ว | Integrate node-cache |
| ไม่มี Health Check | ✅ แก้แล้ว | เพิ่ม /health และ /ready |
| ไม่มี Graceful Shutdown | ✅ แก้แล้ว | รองรับ SIGTERM/SIGINT |

---

## 🔒 Security Checklist

### Authentication & Authorization
- [x] Discord OAuth2 integration
- [x] Session-based authentication
- [x] Admin role verification via Discord IDs
- [x] Session cookies: httpOnly, secure, sameSite

### Rate Limiting (DDoS/Brute Force Protection)
- [x] API: 100 req/15 min
- [x] Login: 5 attempts/15 min
- [x] Purchase: 10/5 min
- [x] Admin: 50/10 min

### Input Validation
- [x] Express-validator middleware
- [x] Joi schema validation
- [x] SQL Injection patterns detection
- [x] XSS patterns detection
- [x] Path traversal detection

### HTTP Security (Helmet.js)
- [x] Content Security Policy (CSP)
- [x] X-Frame-Options
- [x] X-Content-Type-Options
- [x] X-XSS-Protection

### Data Protection
- [x] Row Level Security (RLS) enabled
- [x] Service key backend only
- [x] Parameterized queries
- [x] Topup requires Admin approval

### Monitoring & Logging
- [x] Request logging
- [x] Error handling without stack traces (prod)
- [x] Suspicious activity detection
- [x] Auto IP blocking
- [x] Audit Logging (admin actions) ⭐ NEW
- [x] Security Events logging ⭐ NEW

---

## 🧪 ทดสอบก่อน Production

```bash
# 1. ทดสอบ Health Check
curl http://localhost:3000/health

# 2. ทดสอบ Login flow
# ไปที่ http://localhost:3000 และทดสอบ Discord login

# 3. ทดสอบซื้อสินค้า
# - เพิ่ม stock ผ่าน Admin Panel
# - Admin approve topup request
# - ทดสอบซื้อสินค้า

# 4. ทดสอบ Race Condition
# เปิด 2 browsers และกดซื้อพร้อมกัน
```

---

## 📊 Endpoints ใหม่

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check สำหรับ monitoring |
| `/ready` | GET | Readiness check สำหรับ K8s |
| `/api/wallet/topup/requests` | GET | ดู topup requests ของ user |
| `/api/wallet/topup/:id/cancel` | POST | ยกเลิก pending topup |
| `/api/admin/topup-requests` | GET | ดู topup requests ทั้งหมด |
| `/api/admin/topup-requests/:id/approve` | POST | Approve topup |
| `/api/admin/topup-requests/:id/reject` | POST | Reject topup |
| `/api/admin/cache-stats` | GET | ดู cache statistics |
| `/api/admin/clear-cache` | POST | Clear all caches |

---

## 🚀 Deploy Commands

```bash
# Install dependencies
npm install

# Start production server
NODE_ENV=production npm start

# หรือใช้ PM2
pm2 start server.js --name "dips-hub" -i max
```

---

## ⚠️ สิ่งที่ยังควรทำเพิ่ม (ถ้ามีเวลา)

1. **Tests** - เพิ่ม unit/integration tests
2. **Logging** - ใช้ Winston แทน console.log
3. **Redis** - ใช้ Redis แทน in-memory session/cache
4. **Monitoring** - เพิ่ม Prometheus metrics
5. **CI/CD** - Setup GitHub Actions
6. **Rate Limit by User** - จำกัด request ต่อ user แทน IP
