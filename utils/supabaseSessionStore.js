/**
 * Supabase Session Store
 * ใช้ Supabase เก็บ session data สำหรับ production (Cloud Run)
 */

const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');

class SupabaseStore extends session.Store {
    constructor(options = {}) {
        super();
        
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
        
        this.tableName = options.tableName || 'sessions';
        this.ttl = options.ttl || 86400; // 24 hours in seconds
        
        // Cleanup expired sessions every hour
        if (options.cleanupInterval !== false) {
            this.cleanupInterval = setInterval(() => {
                this.cleanup();
            }, options.cleanupInterval || 3600000); // 1 hour
        }
    }

    async get(sid, callback) {
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select('sess')
                .eq('sid', sid)
                .gt('expire', new Date().toISOString())
                .single();

            if (error || !data) {
                return callback(null, null);
            }

            callback(null, data.sess);
        } catch (err) {
            callback(err);
        }
    }

    async set(sid, sess, callback) {
        try {
            const maxAge = sess.cookie?.maxAge || this.ttl * 1000;
            const expire = new Date(Date.now() + maxAge);

            const { error } = await this.supabase
                .from(this.tableName)
                .upsert({
                    sid: sid,
                    sess: sess,
                    expire: expire.toISOString()
                }, {
                    onConflict: 'sid'
                });

            if (error) {
                return callback(error);
            }

            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    async destroy(sid, callback) {
        try {
            const { error } = await this.supabase
                .from(this.tableName)
                .delete()
                .eq('sid', sid);

            if (error) {
                return callback(error);
            }

            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    async touch(sid, sess, callback) {
        try {
            const maxAge = sess.cookie?.maxAge || this.ttl * 1000;
            const expire = new Date(Date.now() + maxAge);

            const { error } = await this.supabase
                .from(this.tableName)
                .update({ expire: expire.toISOString() })
                .eq('sid', sid);

            if (error) {
                return callback(error);
            }

            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    async cleanup() {
        try {
            await this.supabase
                .from(this.tableName)
                .delete()
                .lt('expire', new Date().toISOString());
        } catch (err) {
            console.error('Session cleanup error:', err);
        }
    }

    close() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = SupabaseStore;
