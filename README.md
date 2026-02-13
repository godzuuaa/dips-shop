# 🎮 DIPS HUB - Roblox Script Store

> Professional e-commerce platform for Roblox scripts and digital products with Discord OAuth authentication, automated delivery system, and comprehensive admin panel.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## ✨ Features

### 🔐 Authentication & Security
- **Discord OAuth2** integration for seamless login
- **Helmet.js** for HTTP security headers
- **Rate limiting** on all sensitive endpoints
- **Input validation** with Joi and Express Validator
- **CSRF protection** ready
- **IP blocking** for suspicious activities

### 💰 E-Commerce System
- **Product management** with categories
- **Real-time stock tracking** from database
- **Automated delivery** system via product_stocks table
- **Shopping cart** functionality
- **Order history** with delivery data

### 💳 Wallet System
- **Balance management** for each user
- **Transaction history** with detailed logs
- **Top-up system** (ready for payment gateway integration)
- **Secure wallet** operations with Supabase

### 👑 Admin Panel
- **Dashboard** with statistics
- **Product CRUD** operations
- **Stock management** (bulk import keys/codes)
- **User management** with balance control
- **Order monitoring**
- **Coupon system** (basic implementation)

### ⚡ Performance
- **In-memory caching** with node-cache
- **Database indexes** for fast queries
- **Optimized queries** to prevent N+1 problem
- **CDN-ready** static files

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Supabase** account ([Get free account](https://supabase.com))
- **Discord** application ([Create app](https://discord.com/developers))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/dips-hub.git
cd dips-hub
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Setup Supabase database**
```bash
# Go to Supabase SQL Editor and run:
# 1. database/schema.sql
# 2. database/indexes.sql
```

5. **Start development server**
```bash
npm run dev
```

6. **Open browser**
```
http://localhost:3000
```

---

## 📁 Project Structure

```
dips-hub/
├── assets/                 # Static assets
├── config/
│   └── supabase.js        # Supabase configuration
├── css/                    # Stylesheets
│   ├── components.css
│   ├── loading.css
│   └── style.css
├── database/
│   ├── schema.sql         # Database schema
│   └── indexes.sql        # Performance indexes
├── images/                 # Product images
├── js/                     # Frontend JavaScript
│   ├── auth.js            # Authentication logic
│   ├── loading.js
│   ├── main.js
│   ├── store.js
│   └── wallet.js
├── middleware/
│   ├── security.js        # Rate limiting, IP blocking
│   └── validation.js      # Input validation
├── pages/                  # HTML pages
│   ├── admin.html         # Admin panel
│   ├── products.html      # Product listing
│   ├── profile.html
│   ├── purchases.html
│   ├── store.html
│   ├── topup.html
│   └── transactions.html
├── utils/
│   ├── cache.js           # Caching system
│   ├── errorHandler.js    # Error handling
│   └── envValidator.js    # Environment validation
├── .env                    # Environment variables (DO NOT COMMIT)
├── .gitignore
├── index.html             # Landing page
├── package.json
├── README.md
└── server.js              # Express server

```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Discord OAuth2
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback

# Session Secret (32+ characters recommended)
SESSION_SECRET=your_very_long_random_secret_key_here

# Server
NODE_ENV=development
PORT=3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Admin Discord IDs (comma-separated)
ADMIN_IDS=your_discord_id,another_admin_id

# Optional
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info
```

### Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 settings
4. Add redirect URL: `http://localhost:3000/auth/discord/callback`
5. Select scopes: `identify`, `email`, `guilds`
6. Copy Client ID and Client Secret to `.env`

### Supabase Setup

1. Create account at [Supabase](https://supabase.com)
2. Create a new project
3. Go to Project Settings > API
4. Copy URL, anon key, and service_role key to `.env`
5. Run `database/schema.sql` in SQL Editor
6. Run `database/indexes.sql` for performance

---

## 🔒 Security Features

### Implemented Security Measures

✅ **Helmet.js** - Security headers (XSS, clickjacking, etc.)  
✅ **Rate Limiting** - Prevent brute force and DDoS  
✅ **Input Validation** - Joi & Express Validator  
✅ **SQL Injection Protection** - Parameterized queries  
✅ **XSS Protection** - Input sanitization  
✅ **CORS Configuration** - Restricted origins  
✅ **IP Blocking** - Automatic suspicious IP blocking  
✅ **Session Security** - Secure session configuration  
✅ **Error Handling** - No sensitive data leakage  

### Security Best Practices

- Never commit `.env` file
- Use HTTPS in production
- Rotate secrets regularly
- Keep dependencies updated
- Enable RLS (Row Level Security) in Supabase
- Monitor logs for suspicious activities

---

## 📊 API Endpoints

### Public Endpoints

```http
GET  /api/products              # Get all products
GET  /api/products/:id          # Get product by ID
POST /auth/discord              # Discord login
GET  /auth/discord/callback     # OAuth callback
```

### Protected Endpoints (Requires Auth)

```http
GET  /api/user                  # Get current user
GET  /api/wallet                # Get wallet balance
GET  /api/wallet/transactions   # Get transaction history
POST /api/products/:id/purchase # Purchase product
POST /api/logout                # Logout
```

### Admin Endpoints (Requires Admin Role)

```http
GET  /api/admin/users           # Get all users
GET  /api/admin/products        # Get all products
POST /api/admin/products        # Create product
PUT  /api/admin/products/:id    # Update product
DEL  /api/admin/products/:id    # Delete product
POST /api/admin/products/:id/stocks/bulk  # Bulk add stocks
GET  /api/admin/products/:id/stocks       # Get product stocks
```

---

## 🛠️ Development

### Available Scripts

```bash
npm start         # Start production server
npm run dev       # Start development server with nodemon
```

### Database Migration

To update database schema:

```sql
-- Run in Supabase SQL Editor
-- 1. Make changes to database/schema.sql
-- 2. Run the updated SQL
-- 3. Update database/indexes.sql if needed
```

### Adding New Features

1. **Backend**: Add routes in `server.js`
2. **Frontend**: Create/edit HTML in `pages/`
3. **Validation**: Add rules in `middleware/validation.js`
4. **Security**: Update `middleware/security.js` if needed

---

## 🐛 Troubleshooting

### Common Issues

**Port 3000 already in use**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill
```

**Supabase connection error**
- Check `.env` credentials
- Verify RLS policies allow operations
- Check Supabase project status

**Discord OAuth not working**
- Verify redirect URI matches exactly
- Check Client ID and Secret
- Ensure scopes are correct

**Stock not updating**
- Clear cache: restart server
- Check `product_stocks` table
- Verify `is_sold` field updates

---

## 📈 Performance Optimization

### Implemented Optimizations

- ✅ Database indexes on frequently queried columns
- ✅ In-memory caching for products and categories
- ✅ Optimized SQL queries (no N+1 problem)
- ✅ CDN-ready static file serving
- ✅ Gzip compression ready

### Recommendations for Production

1. Use **Redis** for distributed caching
2. Enable **CDN** for static assets
3. Use **PM2** for process management
4. Enable **database connection pooling**
5. Implement **log aggregation** (ELK, Datadog)
6. Add **monitoring** (New Relic, Sentry)

---

## 🚀 Deployment

### Deploy to Production

1. **Set environment to production**
```env
NODE_ENV=production
```

2. **Use process manager (PM2)**
```bash
npm install -g pm2
pm2 start server.js --name dips-hub
pm2 save
pm2 startup
```

3. **Enable HTTPS** (Use Nginx reverse proxy)

4. **Setup domain and SSL**
```bash
# Install Certbot
sudo certbot --nginx -d yourdomain.com
```

5. **Update environment variables**
```env
DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
FRONTEND_URL=https://yourdomain.com
```

### Recommended Hosting

- **Backend**: VPS (DigitalOcean, AWS EC2, Linode)
- **Database**: Supabase (managed PostgreSQL)
- **CDN**: Cloudflare
- **Domain**: Namecheap, GoDaddy

---

## 📝 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📧 Support

For support, email support@dipshub.com or join our [Discord server](https://discord.gg/yourdiscord).

---

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/)
- [Supabase](https://supabase.com/)
- [Discord](https://discord.com/)
- [Node.js](https://nodejs.org/)

---

**Made with ❤️ by DIPS HUB Team**
