document.addEventListener('DOMContentLoaded', () => {
    const btnConnect = document.getElementById('btn-connect');
    const tokenInput = document.getElementById('gh-token');
    const profileDisplay = document.getElementById('profile-display');
    const profileContent = document.getElementById('profile-content');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');

    // Pre-fill the token provided by the user (as requested)
    // Note: In a real app, users would enter this themselves.
    // Token field will be empty for security reasons. Users should provide their own token.
    tokenInput.value = '';

    btnConnect.addEventListener('click', async () => {
        const token = tokenInput.value.trim();

        if (!token) {
            showError('Bitte gib einen Token ein.');
            return;
        }

        startLoading();

        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Ungültiger Token oder Netzwerkproblem');
            }

            const userData = await response.json();
            renderProfile(userData);
        } catch (error) {
            showError(error.message);
        } finally {
            stopLoading();
        }
    });

    function renderProfile(user) {
        errorMessage.classList.add('hidden');
        profileDisplay.classList.remove('hidden');

        profileContent.innerHTML = `
            <div class="profile-header">
                <img src="${user.avatar_url}" alt="${user.login}" class="avatar">
                <div class="profile-info">
                    <h2>${user.name || user.login}</h2>
                    <a href="${user.html_url}" target="_blank">@${user.login}</a>
                    <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #94a3b8;">${user.bio || 'Keine Bio verfügbar.'}</p>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-value">${user.public_repos}</span>
                    <span class="stat-label">Repos</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${user.followers}</span>
                    <span class="stat-label">Follower</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${user.following}</span>
                    <span class="stat-label">Folgt</span>
                </div>
            </div>
            
            <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
                <p style="font-size: 0.875rem; color: #94a3b8;">Standort: ${user.location || 'Nicht angegeben'}</p>
                <p style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.5rem;">Mitglied seit: ${new Date(user.created_at).toLocaleDateString()}</p>
            </div>
        `;
    }

    function startLoading() {
        loader.classList.remove('hidden');
        profileContent.innerHTML = '';
        profileDisplay.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    }

    function stopLoading() {
        loader.classList.add('hidden');
    }

    function showError(message) {
        profileDisplay.classList.add('hidden');
        errorMessage.classList.remove('hidden');
        errorMessage.querySelector('p').textContent = message;
    }
});
