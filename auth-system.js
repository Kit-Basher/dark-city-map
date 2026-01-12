/**
 * Centralized Authentication System for Dark City
 * Replaces all messy authentication with unified Discord OAuth + RBAC
 */

const https = require('https');

// Discord Configuration - Centralized
const DISCORD_CONFIG = {
  GUILD_ID: process.env.DISCORD_GUILD_ID,
  BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  CALLBACK_URL: process.env.DISCORD_CALLBACK_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  
  // Role IDs - from memory system
  MODERATOR_ROLE_ID: '1261096385277722666',
  ADMIN_ROLE_ID: '1261095707494842519',
  WRITER_ROLE_ID: process.env.WRITER_ROLE_ID || '1277450947664150538', // Fallback to known writer role
  READER_ROLE_ID: '1261096495860682873'
};

// Cache for role checks to reduce API calls
const roleCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Unified Role-Based Access Control System
 */
class RBAC {
  static PERMISSIONS = {
    // Public permissions
    VIEW_GAME_PAGE: 'view_game_page',
    VIEW_MAP_PAGE: 'view_map_page',
    
    // Writer permissions (require quiz completion)
    CREATE_CHARACTER: 'create_character',
    CREATE_MAP_PIN: 'create_map_pin',
    EDIT_OWN_CHARACTER: 'edit_own_character',
    EDIT_OWN_MAP_PIN: 'edit_own_map_pin',
    
    // Moderator permissions
    MODERATE_CONTENT: 'moderate_content',
    VIEW_DASHBOARD: 'view_dashboard',
    MANAGE_QUIZ: 'manage_quiz',
    APPROVE_CHARACTER: 'approve_character',
    
    // Admin permissions
    MANAGE_ROLES: 'manage_roles',
    SYSTEM_CONFIG: 'system_config'
  };

  static ROLES = {
    PUBLIC: 'public',
    READER: 'reader', 
    WRITER: 'writer',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
  };

  // Role to permissions mapping - use string literals instead of references
  static ROLE_PERMISSIONS = {
    ['public']: [
      RBAC.PERMISSIONS.VIEW_GAME_PAGE,
      RBAC.PERMISSIONS.VIEW_MAP_PAGE
    ],
    ['reader']: [
      RBAC.PERMISSIONS.VIEW_GAME_PAGE,
      RBAC.PERMISSIONS.VIEW_MAP_PAGE
    ],
    ['writer']: [
      RBAC.PERMISSIONS.VIEW_GAME_PAGE,
      RBAC.PERMISSIONS.VIEW_MAP_PAGE,
      RBAC.PERMISSIONS.CREATE_CHARACTER,
      RBAC.PERMISSIONS.CREATE_MAP_PIN,
      RBAC.PERMISSIONS.EDIT_OWN_CHARACTER,
      RBAC.PERMISSIONS.EDIT_OWN_MAP_PIN
    ],
    ['moderator']: [
      RBAC.PERMISSIONS.VIEW_GAME_PAGE,
      RBAC.PERMISSIONS.VIEW_MAP_PAGE,
      RBAC.PERMISSIONS.CREATE_CHARACTER,
      RBAC.PERMISSIONS.CREATE_MAP_PIN,
      RBAC.PERMISSIONS.EDIT_OWN_CHARACTER,
      RBAC.PERMISSIONS.EDIT_OWN_MAP_PIN,
      RBAC.PERMISSIONS.MODERATE_CONTENT,
      RBAC.PERMISSIONS.VIEW_DASHBOARD,
      RBAC.PERMISSIONS.MANAGE_QUIZ,
      RBAC.PERMISSIONS.APPROVE_CHARACTER
    ],
    ['admin']: [
      RBAC.PERMISSIONS.VIEW_GAME_PAGE,
      RBAC.PERMISSIONS.VIEW_MAP_PAGE,
      RBAC.PERMISSIONS.CREATE_CHARACTER,
      RBAC.PERMISSIONS.CREATE_MAP_PIN,
      RBAC.PERMISSIONS.EDIT_OWN_CHARACTER,
      RBAC.PERMISSIONS.EDIT_OWN_MAP_PIN,
      RBAC.PERMISSIONS.MODERATE_CONTENT,
      RBAC.PERMISSIONS.VIEW_DASHBOARD,
      RBAC.PERMISSIONS.MANAGE_QUIZ,
      RBAC.PERMISSIONS.APPROVE_CHARACTER,
      RBAC.PERMISSIONS.MANAGE_ROLES,
      RBAC.PERMISSIONS.SYSTEM_CONFIG
    ]
  };

  /**
   * Check if a role has a specific permission
   */
  static hasPermission(role, permission) {
    const permissions = RBAC.ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  }
}

/**
 * Discord API integration with caching
 */
class DiscordAPI {
  /**
   * Get user's Discord roles with caching
   */
  static async getUserRoles(userId) {
    if (!userId || !DISCORD_CONFIG.GUILD_ID || !DISCORD_CONFIG.BOT_TOKEN) {
      throw new Error('Discord configuration incomplete');
    }

    const cacheKey = `user_roles:${userId}`;
    const cached = roleCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.roles;
    }

    try {
      const url = `https://discord.com/api/v10/guilds/${DISCORD_CONFIG.GUILD_ID}/members/${userId}`;
      
      const response = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          headers: {
            Authorization: `Bot ${DISCORD_CONFIG.BOT_TOKEN}`,
          },
          timeout: 10000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              resolve({ status: res.statusCode, data: jsonData });
            } catch (e) {
              reject(e);
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      });

      if (response.status !== 200) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      const roles = Array.isArray(response.data?.roles) ? response.data.roles : [];
      
      // Cache the result
      roleCache.set(cacheKey, {
        roles,
        expiresAt: Date.now() + CACHE_TTL
      });

      return roles;
    } catch (error) {
      console.error('Error fetching Discord roles:', error.message);
      // Cache failure for a shorter time to prevent repeated failed calls
      roleCache.set(cacheKey, {
        roles: [],
        expiresAt: Date.now() + 60000 // 1 minute
      });
      return [];
    }
  }

  /**
   * Check if user has specific role
   */
  static async hasRole(userId, roleId) {
    const roles = await DiscordAPI.getUserRoles(userId);
    return roles.includes(roleId);
  }

  /**
   * Get user's highest role based on hierarchy
   */
  static async getUserHighestRole(userId) {
    const roles = await DiscordAPI.getUserRoles(userId);
    
    // Check in order of precedence
    if (roles.includes(DISCORD_CONFIG.ADMIN_ROLE_ID)) {
      return RBAC.ROLES.ADMIN;
    }
    if (roles.includes(DISCORD_CONFIG.MODERATOR_ROLE_ID)) {
      return RBAC.ROLES.MODERATOR;
    }
    if (roles.includes(DISCORD_CONFIG.WRITER_ROLE_ID)) {
      return RBAC.ROLES.WRITER;
    }
    if (roles.includes(DISCORD_CONFIG.READER_ROLE_ID)) {
      return RBAC.ROLES.READER;
    }
    
    return RBAC.ROLES.PUBLIC;
  }

  /**
   * Clear cache for a user (useful when roles change)
   */
  static clearUserCache(userId) {
    const keysToDelete = [];
    for (const key of roleCache.keys()) {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => roleCache.delete(key));
  }
}

/**
 * Authentication Middleware Factory
 */
class AuthMiddleware {
  /**
   * Require Discord authentication
   */
  static requireDiscordAuth() {
    return (req, res, next) => {
      if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.id) {
        return next();
      }
      
      // For API routes, return JSON
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ 
          error: 'Discord authentication required',
          message: 'Please login with Discord to access this resource'
        });
      }
      
      // For page routes, redirect to Discord OAuth
      const returnTo = req.originalUrl || '/';
      return res.redirect(`/auth/discord?returnTo=${encodeURIComponent(returnTo)}`);
    };
  }

  /**
   * Require specific permission
   */
  static requirePermission(permission) {
    return async (req, res, next) => {
      try {
        // First ensure user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user.id) {
          return AuthMiddleware.requireDiscordAuth()(req, res, next);
        }

        // Get user's highest role
        const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
        
        // Check if role has the required permission
        if (!RBAC.hasPermission(userRole, permission)) {
          console.warn(`Access denied: User ${req.user.id} (${userRole}) attempted to access ${permission}`);
          
          if (req.path.startsWith('/api/')) {
            return res.status(403).json({
              error: 'Access denied',
              message: `You need ${permission} permission to access this resource`,
              requiredRole: userRole
            });
          } else {
            return res.status(403).send('Access denied');
          }
        }

        // Attach role and permissions to request for later use
        req.userRole = userRole;
        req.userPermissions = RBAC.ROLE_PERMISSIONS[userRole] || [];
        
        next();
      } catch (error) {
        console.error('Permission check error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Failed to verify permissions'
        });
      }
    };
  }

  /**
   * Require specific role
   */
  static requireRole(requiredRole) {
    return async (req, res, next) => {
      try {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user.id) {
          return AuthMiddleware.requireDiscordAuth()(req, res, next);
        }

        const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
        
        if (userRole !== requiredRole && !RBAC.hasPermission(userRole, `access_${requiredRole}`)) {
          console.warn(`Role access denied: User ${req.user.id} (${userRole}) attempted to access ${requiredRole} role area`);
          
          if (req.path.startsWith('/api/')) {
            return res.status(403).json({
              error: 'Access denied',
              message: `You need ${requiredRole} role to access this resource`,
              currentRole: userRole
            });
          } else {
            return res.status(403).send('Access denied');
          }
        }

        req.userRole = userRole;
        req.userPermissions = RBAC.ROLE_PERMISSIONS[userRole] || [];
        
        next();
      } catch (error) {
        console.error('Role check error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Failed to verify role'
        });
      }
    };
  }

  /**
   * Ownership check - user can only access their own resources unless they're moderator/admin
   */
  static requireOwnershipOrModerator(resourceOwnerIdField = 'ownerId') {
    return async (req, res, next) => {
      try {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user || !req.user.id) {
          return AuthMiddleware.requireDiscordAuth()(req, res, next);
        }

        const userRole = await DiscordAPI.getUserHighestRole(req.user.id);
        
        // Moderators and admins can access any resource
        if (userRole === RBAC.ROLES.MODERATOR || userRole === RBAC.ROLES.ADMIN) {
          req.userRole = userRole;
          req.userPermissions = RBAC.ROLE_PERMISSIONS[userRole] || [];
          return next();
        }

        // For other users, check ownership
        // This assumes the route will attach the resource to req.resource
        if (req.resource && req.resource[resourceOwnerIdField] === req.user.id) {
          req.userRole = userRole;
          req.userPermissions = RBAC.ROLE_PERMISSIONS[userRole] || [];
          return next();
        }

        console.warn(`Ownership access denied: User ${req.user.id} attempted to access resource owned by ${req.resource?.[resourceOwnerIdField]}`);
        
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'You can only access your own resources'
          });
        } else {
          return res.status(403).send('Access denied');
        }
      } catch (error) {
        console.error('Ownership check error:', error);
        return res.status(500).json({
          error: 'Authentication error',
          message: 'Failed to verify ownership'
        });
      }
    };
  }
}

/**
 * Quiz completion verification for Writer role
 * Note: This is only used by the game service, not map-web
 */
class QuizSystem {
  /**
   * Check if user has passed the quiz and has Writer role
   * Map-web service doesn't use quiz functionality
   */
  static async isQualifiedWriter(userId) {
    try {
      // For map-web, only check Discord role (no quiz system here)
      const hasWriterRole = await DiscordAPI.hasRole(userId, DISCORD_CONFIG.WRITER_ROLE_ID);
      return hasWriterRole;
    } catch (error) {
      console.error('Error checking writer qualification:', error);
      return false;
    }
  }
}

module.exports = {
  RBAC,
  DiscordAPI,
  AuthMiddleware,
  QuizSystem,
  DISCORD_CONFIG
};
