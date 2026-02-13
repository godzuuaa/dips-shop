/**
 * Environment Variable Validation
 * ตรวจสอบว่า environment variables ครบถ้วนและถูกต้อง
 */

const Joi = require('joi');

// =============================================
// Environment Schema
// =============================================

const envSchema = Joi.object({
    // Server
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number()
        .default(3000),

    // Discord OAuth
    DISCORD_CLIENT_ID: Joi.string()
        .required()
        .messages({
            'any.required': 'DISCORD_CLIENT_ID is required. Get it from https://discord.com/developers'
        }),
    DISCORD_CLIENT_SECRET: Joi.string()
        .required()
        .messages({
            'any.required': 'DISCORD_CLIENT_SECRET is required'
        }),
    DISCORD_REDIRECT_URI: Joi.string()
        .uri()
        .required()
        .messages({
            'any.required': 'DISCORD_REDIRECT_URI is required (e.g., http://localhost:3000/auth/discord/callback)'
        }),

    // Session
    SESSION_SECRET: Joi.string()
        .min(32)
        .required()
        .messages({
            'string.min': 'SESSION_SECRET must be at least 32 characters for security',
            'any.required': 'SESSION_SECRET is required'
        }),

    // Supabase
    SUPABASE_URL: Joi.string()
        .uri()
        .required()
        .messages({
            'any.required': 'SUPABASE_URL is required. Get it from https://supabase.com'
        }),
    SUPABASE_ANON_KEY: Joi.string()
        .required()
        .messages({
            'any.required': 'SUPABASE_ANON_KEY is required'
        }),
    SUPABASE_SERVICE_KEY: Joi.string()
        .required()
        .messages({
            'any.required': 'SUPABASE_SERVICE_KEY is required'
        }),

    // Admin IDs (comma-separated Discord IDs)
    ADMIN_IDS: Joi.string()
        .required()
        .messages({
            'any.required': 'ADMIN_IDS is required (comma-separated Discord user IDs)'
        }),

    // Optional
    FRONTEND_URL: Joi.string().uri().optional(),
    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'debug')
        .default('info'),
})
.unknown(true); // Allow other env vars

// =============================================
// Validation Function
// =============================================

function validateEnv() {
    console.log('🔍 Validating environment variables...\n');

    const { error, value: validatedEnv } = envSchema.validate(process.env, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        console.error('❌ Environment validation failed:\n');
        
        error.details.forEach((detail, index) => {
            console.error(`   ${index + 1}. ${detail.message}`);
        });

        console.error('\n💡 Please check your .env file and fix the issues above.\n');
        
        // Exit ใน production
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }

        // Warning ใน development
        console.warn('⚠️  Running in development mode with invalid environment variables\n');
    } else {
        console.log('✅ Environment variables validated successfully\n');
    }

    return validatedEnv;
}

// =============================================
// Check Required Services
// =============================================

async function checkServices() {
    const checks = [];

    // Check Supabase
    if (process.env.SUPABASE_URL) {
        checks.push({
            name: 'Supabase',
            status: '✅',
            message: 'Connected'
        });
    } else {
        checks.push({
            name: 'Supabase',
            status: '❌',
            message: 'Not configured'
        });
    }

    // Check Discord OAuth
    if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
        checks.push({
            name: 'Discord OAuth',
            status: '✅',
            message: 'Configured'
        });
    } else {
        checks.push({
            name: 'Discord OAuth',
            status: '❌',
            message: 'Not configured'
        });
    }

    // Check Admin IDs
    const adminIds = (process.env.ADMIN_IDS || '').split(',').filter(Boolean);
    if (adminIds.length > 0) {
        checks.push({
            name: 'Admin Users',
            status: '✅',
            message: `${adminIds.length} admin(s) configured`
        });
    } else {
        checks.push({
            name: 'Admin Users',
            status: '⚠️',
            message: 'No admins configured'
        });
    }

    return checks;
}

// =============================================
// Print Status
// =============================================

async function printStatus() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║         🔧 System Configuration            ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  Environment: ${process.env.NODE_ENV || 'development'}`.padEnd(46) + '║');
    console.log(`║  Port: ${process.env.PORT || 3000}`.padEnd(46) + '║');
    console.log('╠════════════════════════════════════════════╣');

    const checks = await checkServices();
    checks.forEach(check => {
        const line = `║  ${check.status} ${check.name}: ${check.message}`;
        console.log(line.padEnd(46) + '║');
    });

    console.log('╚════════════════════════════════════════════╝\n');
}

// =============================================
// Generate .env.example
// =============================================

function generateEnvExample() {
    const example = `# Discord OAuth2 Configuration
# Get these from: https://discord.com/developers/applications
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback

# Session Secret (Change this to a random string!)
SESSION_SECRET=change_this_to_a_very_long_random_string_at_least_32_characters

# Server Configuration
NODE_ENV=development
PORT=3000

# Supabase Configuration
# Get these from: https://supabase.com (Project Settings > API)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_KEY=your_supabase_service_key_here

# Admin Discord User IDs (comma-separated)
ADMIN_IDS=your_discord_id_here,another_admin_id

# Optional
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info
`;

    return example;
}

// =============================================
// Export
// =============================================

module.exports = {
    validateEnv,
    checkServices,
    printStatus,
    generateEnvExample
};
