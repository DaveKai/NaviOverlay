// Login form handler with token generation
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginWrapper');
    const errorDisplay = document.getElementById('errorDisplay');
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const serverURL = document.getElementById('serverURL').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        
        errorDisplay.style.display = 'none';
        
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Connecting...';
        submitBtn.disabled = true;
        
        try {
            // test connection using Subsonic API ping
            const testUrl = `${serverURL}/rest/ping.view?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}&v=1.16.1&c=NaviOverlay&f=json`;
            
            const response = await fetch(testUrl, {
                method: 'GET'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // check if subsonic response is successful
                if (data['subsonic-response'] && data['subsonic-response'].status === 'ok') {
                    
                    // generating secure token
                    submitBtn.textContent = 'Generating overlay...';
                    
                    const credentials = {
                        serverURL: serverURL,
                        username: username,
                        password: password
                    };
                    
                    // Send credentials to server to generate token
                    const tokenResponse = await fetch('/api/generate-token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ credentials })
                    });
                    
                    if (tokenResponse.ok) {
                        const tokenData = await tokenResponse.json();
                        
                        window.location.href = tokenData.overlayUrl;
                        
                    } else {
                        throw new Error('Failed to generate overlay link');
                    }
                    
                } else {
                    throw new Error('Authentication failed');
                }
            } else {
                throw new Error('Server connection failed');
            }
            
        } catch (error) {
            console.error('Login error:', error);
            errorDisplay.style.display = 'block';
            errorDisplay.textContent = 'Please check your credentials and server URL';
            
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
});