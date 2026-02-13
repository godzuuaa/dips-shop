# 🔒 Security Policy

## Reporting Security Vulnerabilities

We take security seriously. If you discover a security vulnerability, please report it to us privately.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email us at: **security@dipshub.com**

Include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix & Disclosure**: Coordinated disclosure after patch

---

## Security Features

### ✅ Implemented Security Measures

#### 1. **Authentication & Authorization**
- Discord OAuth2 integration
- Session-based authentication
- Admin role verification
- Token expiration handling

#### 2. **Input Validation**
- Joi schema validation
- Express-validator middleware
- SQL injection prevention (parameterized queries)
- XSS protection (input sanitization)

#### 3. **Rate Limiting**
- API rate limiting (100 req/15min)
- Login rate limiting (5 attempts/15min)
- Purchase rate limiting (10 purchases/5min)
- Admin action rate limiting (50 actions/10min)

#### 4. **HTTP Security**
- Helmet.js security headers
- CORS configuration
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options

#### 5. **Data Protection**
- Environment variable validation
- Sensitive data exclusion from logs
- Secure session configuration
- Password-less authentication (OAuth)

#### 6. **Monitoring & Detection**
- Request logging
- Suspicious activity detection
- Automatic IP blocking
- Error tracking

---

## Security Best Practices

### For Developers

1. **Environment Variables**
   ```bash
   # NEVER commit .env file
   # Always use .env.example as template
   # Rotate secrets regularly
   ```

2. **Dependencies**
   ```bash
   # Check for vulnerabilities
   npm audit
   
   # Fix vulnerabilities
   npm audit fix
   
   # Update dependencies
   npm update
   ```

3. **Code Review**
   - Review all database queries
   - Validate all user inputs
   - Check for sensitive data leaks
   - Test rate limiting

4. **Database Security**
   - Enable RLS (Row Level Security) in Supabase
   - Use service key only in backend
   - Never expose service key to frontend
   - Backup database regularly

### For Deployment

1. **HTTPS Only**
   ```nginx
   # Force HTTPS
   server {
       listen 80;
       return 301 https://$host$request_uri;
   }
   ```

2. **Environment**
   ```env
   NODE_ENV=production
   SESSION_SECRET=<generate-new-long-secret>
   ```

3. **Monitoring**
   - Set up error tracking (Sentry, LogRocket)
   - Monitor unusual traffic patterns
   - Set up alerts for failed logins
   - Log all admin actions

4. **Firewall**
   ```bash
   # Allow only necessary ports
   ufw allow 22    # SSH
   ufw allow 80    # HTTP
   ufw allow 443   # HTTPS
   ufw enable
   ```

---

## Secure Configuration Checklist

### Before Going Live

- [ ] Change all default secrets in `.env`
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Set `NODE_ENV=production`
- [ ] Enable Supabase RLS policies
- [ ] Configure CORS whitelist
- [ ] Set up monitoring and logging
- [ ] Enable automatic backups
- [ ] Test rate limiting
- [ ] Verify admin IDs are correct
- [ ] Remove test/development data
- [ ] Update Discord OAuth redirect URI
- [ ] Set secure session cookie options
- [ ] Enable database connection pooling
- [ ] Configure firewall rules
- [ ] Set up DDoS protection (Cloudflare)
- [ ] Review and minimize CORS origins

---

## Known Security Considerations

### Current Limitations

1. **CSRF Protection**: Partially implemented (needs frontend token handling)
2. **Payment Gateway**: Not yet integrated (use trusted providers)
3. **2FA**: Not implemented (future enhancement)
4. **API Keys**: No API key system for external integrations

### Planned Improvements

- [ ] CSRF token implementation
- [ ] Payment gateway integration (TrueMoney, PromptPay)
- [ ] Two-factor authentication
- [ ] API key management system
- [ ] Advanced fraud detection
- [ ] Rate limiting per user (not just IP)
- [ ] Webhook signature verification

---

## Security Updates

We regularly update dependencies and address security issues.

### Update Schedule

- **Critical**: Immediate patch
- **High**: Within 48 hours
- **Medium**: Within 1 week
- **Low**: Next release cycle

### Changelog

See [CHANGELOG.md](CHANGELOG.md) for security-related updates.

---

## Compliance

### Data Protection

- User data stored in Supabase (GDPR compliant)
- Session data encrypted
- No plaintext password storage (OAuth only)
- Right to data deletion (contact support)

### Privacy

- Minimal data collection (Discord ID, username, email)
- No tracking without consent
- Cookie policy disclosure required
- Privacy policy recommended

---

## Contact

For security concerns: **security@dipshub.com**  
For general support: **support@dipshub.com**

---

**Last Updated**: February 6, 2026
