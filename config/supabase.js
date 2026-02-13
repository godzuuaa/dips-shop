/**
 * Dips Hub - Supabase Configuration
 * เชื่อมต่อกับ Supabase Database
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase credentials from .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Validate credentials
if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Supabase credentials not found! Please update .env file.');
}

// Public client (for frontend - ใช้ anon key)
const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
    auth: {
        autoRefreshToken: true,
        persistSession: false
    }
});

// Admin client (for backend - ใช้ service key เพื่อ bypass RLS)
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || supabaseKey || '', {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

module.exports = { supabase, supabaseAdmin };
