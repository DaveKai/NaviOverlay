const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// load settings
const settings = require('./config/settings.js');

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// checking config directory
if (!fs.existsSync('./config')) {
    fs.mkdirSync('./config');
}

// grabbing the token file
const TOKENS_FILE = './config/tokens.json';

// Initialize tokens file if it doesn't exist
if (!fs.existsSync(TOKENS_FILE)) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ tokens: [] }, null, 2));
}

// consts for encryption
const SECRET = 'navioverlay-secret-key';
const SALT = 'salt';
const ALGORITHM = 'aes-256-cbc';

function loadTokens() {
    try {
        const data = fs.readFileSync(TOKENS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading tokens:', error);
        return { tokens: [] };
    }
}

function saveTokens(tokensData) {
    try {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokensData, null, 2));
    } catch (error) {
        console.error('Error saving tokens:', error);
    }
}

function cleanExpiredTokens() {
    const tokensData = loadTokens();
    const now = Date.now();
    
    // filter out expired tokens (keep tokens that don't expire or haven't expired yet)
    tokensData.tokens = tokensData.tokens.filter(token => {
        return token.expires === 0 || token.expires > now;
    });
    
    saveTokens(tokensData);
    return tokensData;
}

function generateSecureId() {
    // generate random string
    return crypto.randomBytes(24).toString('hex');
}

function hashCredentials(credentials) {
    // create a hash of credentials for storage (not reversible)
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(credentials));
    return hash.digest('hex');
}

function getKey() {
    // derive a 32-byte key from SECRET + SALT
    return crypto.scryptSync(SECRET, SALT, 32);
}

function encryptCredentials(credentials) {
    const key = getKey();
    const iv = crypto.randomBytes(16); // 16 bytes for AES-256-CBC
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        encrypted: encrypted,
        iv: iv.toString('hex')
    };
}

function decryptCredentials(encryptedData) {
    try {
        const key = getKey();
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

// routes

// generate yoken endpoint
app.post('/api/generate-token', (req, res) => {
    try {
        const { credentials } = req.body;
        
        if (!credentials || !credentials.serverURL || !credentials.username || !credentials.password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }
        
        // clean expired tokens first
        cleanExpiredTokens();
        
        // generate new token
        const tokenId = generateSecureId();
        const encryptedCreds = encryptCredentials(credentials);
        
        // calculate expiry
        let expires = 0; //never expire
        if (settings.expires > 0) {
            expires = Date.now() + (settings.expires * 24 * 60 * 60 * 1000); // Convert days to milliseconds
        }
        
        // create token entry
        const tokenEntry = {
            id: tokenId,
            credentials_hash: hashCredentials(credentials),
            credentials_encrypted: encryptedCreds,
            created: Date.now(),
            expires: expires
        };
        
        // save to file
        const tokensData = loadTokens();
        tokensData.tokens.push(tokenEntry);
        saveTokens(tokensData);
        
        console.log(`Token generated: ${tokenId} (expires: ${expires === 0 ? 'never' : new Date(expires).toISOString()})`);
        
        res.json({ 
            success: true, 
            tokenId: tokenId,
            overlayUrl: `/overlay/${tokenId}`
        });
        
    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// validate token and get credentials
app.get('/api/token/:tokenId', (req, res) => {
    try {
        const { tokenId } = req.params;
        
        // clean expired tokens
        const tokensData = cleanExpiredTokens();
        
        // finding tokens
        const token = tokensData.tokens.find(t => t.id === tokenId);
        
        if (!token) {
            return res.status(404).json({ error: 'Token not found' });
        }
        
        // check if expired
        if (token.expires > 0 && Date.now() > token.expires) {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        // decrypt credentials
        const credentials = decryptCredentials(token.credentials_encrypted);
        
        if (!credentials) {
            return res.status(500).json({ error: 'Failed to decrypt credentials' });
        }
        
        res.json({ 
            success: true, 
            credentials: credentials 
        });
        
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'Failed to validate token' });
    }
});

// serve overlay page for valid tokens
app.get('/overlay/:tokenId', (req, res) => {
    const { tokenId } = req.params;
    
    const tokensData = cleanExpiredTokens();
    
    // token finder
    const token = tokensData.tokens.find(t => t.id === tokenId);
    
    if (!token) {
        return res.status(404).send(`
            <html>
                <head><title>Invalid Link</title></head>
                <body style="text-align: center; padding: 50px; font-family: Arial;">
                    <h2>Invalid Overlay Link</h2>
                    <p>This overlay link is invalid or has been removed.</p>
                    <a href="/">← Back to Login</a>
                </body>
            </html>
        `);
    }
    
    // check if expired
    if (token.expires > 0 && Date.now() > token.expires) {
        return res.status(401).send(`
            <html>
                <head><title>Expired Link</title></head>
                <body style="text-align: center; padding: 50px; font-family: Arial;">
                    <h2>Overlay Link Expired</h2>
                    <p>This overlay link has expired. Please generate a new one.</p>
                    <a href="/">← Back to Login</a>
                </body>
            </html>
        `);
    }
    
    // serve overlay HTML with token embedded
    const overlayPath = path.join(__dirname, 'overlay', 'overlay.html');
    
    if (fs.existsSync(overlayPath)) {
        let overlayHTML = fs.readFileSync(overlayPath, 'utf8');
        
        // Inject token ID into the page
        overlayHTML = overlayHTML.replace(
            '<script src="overlay.js"></script>',
            `<script>window.OVERLAY_TOKEN = '${tokenId}';</script><script src="overlay.js"></script>`
        );
        
        res.send(overlayHTML);
    } else {
        res.status(404).send('Overlay file not found');
    }
});

// 
setInterval(() => {
    console.log('Cleaning expired tokens...');
    cleanExpiredTokens();
}, 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🎵 NaviOverlay server running on http://localhost:${PORT}`);
    console.log(`⚙️ Config: expires after ${settings.expires === 0 ? 'never' : settings.expires + ' days'}`);
    
    cleanExpiredTokens();
});


