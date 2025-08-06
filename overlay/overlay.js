// now playing functionality with token-based authentication
let credentials = null;
let currentSongId = null;
let updateInterval = null;

document.addEventListener('DOMContentLoaded', function() {
    // get token from window injected by server
    const token = window.OVERLAY_TOKEN;
    
    if (!token) {
        console.error('No overlay token found');
        showError('Invalid overlay link');
        return;
    }
    

    loadCredentialsFromToken(token);
    showOverlayTemporarily();
});

async function loadCredentialsFromToken(token) {
    try {
        console.log('Loading credentials for token:', token);
        
        const response = await fetch(`/api/token/${token}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Overlay link not found');
            } else if (response.status === 401) {
                throw new Error('Overlay link has expired');
            } else {
                throw new Error('Failed to load overlay');
            }
        }
        
        const data = await response.json();
        credentials = data.credentials;
        
        console.log('Credentials loaded successfully');
        
        // polling for now playing info
        startNowPlayingUpdates();
        
    } catch (error) {
        console.error('Token validation error:', error);
        showError(error.message);
    }
}

function showError(message) {
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif; text-align: center; background:rgb(0, 0, 0); color: white;">
            <div>
                <h2>${message}</h2>
                <p>Please generate a new overlay link.</p>
                <a href="/" style="color: white; text-decoration: none;">← Back to Login</a>
            </div>
        </div>
    `;
}

async function startNowPlayingUpdates() {
    console.log('Starting now playing updates...');
    
    await updateNowPlaying();
    
    // interval to check every 3 seconds
    updateInterval = setInterval(async () => {
        console.log('Checking for updates...');
        await updateNowPlaying();
    }, 3000);
}

async function updateNowPlaying() {
    try {
        const nowPlayingUrl = `${credentials.serverURL}/rest/getNowPlaying.view?u=${encodeURIComponent(credentials.username)}&p=${encodeURIComponent(credentials.password)}&v=1.16.1&c=NaviOverlay&f=json`;

        const response = await fetch(nowPlayingUrl, { method: 'GET' });

        if (!response.ok) throw new Error('Failed to fetch now playing');

        const data = await response.json();

        if (data['subsonic-response'] && data['subsonic-response'].status === 'ok') {
            const nowPlayingData = data['subsonic-response'].nowPlaying;

            if (nowPlayingData && nowPlayingData.entry && nowPlayingData.entry.length > 0) {
                // Filter only the current user's playing entries
                const userEntries = nowPlayingData.entry.filter(e => e.username === credentials.username);

                if (userEntries.length > 0) {
                    const song = userEntries[0];
                    // Build a signature that's unlikely to falsely stay the same when track changed
                    const songSignature = `${song.title || ''}--${song.artist || ''}--${song.album || ''}`;

                    if (songSignature !== currentSongId) {
                        console.log('new song detected, updating UI...');
                        currentSongId = songSignature;
                        await updateUI(song);
                        showOverlayTemporarily();
                    }
                } else {
                    console.log('no song playing');
                    clearDisplay();
                    currentSongId = null;
                }
            } else {
                console.log('no song currently playing');
                clearDisplay();
                currentSongId = null;
            }
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (error) {
        console.error(':( error updating now playing:', error);
    }
}

async function updateUI(song) {
    const songImage = document.getElementById('songImage');
    const songTitle = document.getElementById('songTitle');
    const songArtist = document.getElementById('songArtist');
    
    // text info updater
    songTitle.textContent = song.title || 'Unknown Title';
    songArtist.textContent = song.artist || 'Unknown Artist';
    
    // album/song art updater
    if (song.coverArt) {
        const coverUrl = `${credentials.serverURL}/rest/getCoverArt.view?id=${song.coverArt}&size=300&u=${encodeURIComponent(credentials.username)}&p=${encodeURIComponent(credentials.password)}&v=1.16.1&c=NaviOverlay`;
        songImage.src = coverUrl;
        
        songImage.onerror = function() {
            // fallback to default image if cover art fails
            songImage.src = 'default-album.png';
        };
    } else {
        songImage.src = 'default-album.png';
    }
}

function clearDisplay() {
    const songImage = document.getElementById('songImage');
    const songTitle = document.getElementById('songTitle');
    const songArtist = document.getElementById('songArtist');
    
    songImage.src = 'default-album.png';
    songTitle.textContent = 'Song Name';
    songArtist.textContent = 'Song Artist';
    
    currentSongId = null;
}

// cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

// animations

function showOverlayTemporarily() {
    const overlay = document.querySelector('.overlayContainer');

    if (window.overlayTimeout) {
        clearTimeout(window.overlayTimeout);
    }

    overlay.classList.add('visible');

    window.overlayTimeout = setTimeout(() => {
        overlay.classList.remove('visible');
    }, 10000); 
}
