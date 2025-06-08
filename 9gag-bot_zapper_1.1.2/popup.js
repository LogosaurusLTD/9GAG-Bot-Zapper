document.addEventListener('DOMContentLoaded', () => {
    restoreBlockingLevel();
    updateCounters();
});
document.getElementById('saveButtonPopup').addEventListener('click', saveBlockingLevel);

function saveBlockingLevel() {
    const blockingLevelSelect = document.getElementById('blockingLevelPopup');
    const blockingLevel = blockingLevelSelect.value;
    chrome.storage.sync.set({
        blockingLevel: blockingLevel
    }, function() {
        const status = document.getElementById('statusPopup');
        status.textContent = 'Settings saved!';
        setTimeout(function() {
            status.textContent = '';
        }, 1500);
    });
}

function restoreBlockingLevel() {
    chrome.storage.sync.get({
        blockingLevel: 'medium'
    }, function(items) {
        document.getElementById('blockingLevelPopup').value = items.blockingLevel;
    });
}

function updateCounters() {
    chrome.storage.local.get('allTimeHiddenPosts', (data) => {
        const total = data.allTimeHiddenPosts || 0;
        document.getElementById('totalCount').textContent = total;
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getSessionHiddenPosts" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('[9GAG Bot Zapper Popup] Error sending message to content script:', chrome.runtime.lastError.message);
                    document.getElementById('sessionCount').textContent = 'N/A';
                } else if (response && typeof response.sessionCount === 'number') {
                    document.getElementById('sessionCount').textContent = response.sessionCount;
                } else {
                    document.getElementById('sessionCount').textContent = 'N/A';
                    console.warn('[9GAG Bot Zapper Popup] Invalid response for session count from content script.');
                }
            });
        } else {
            document.getElementById('sessionCount').textContent = 'N/A (No active tab found)';
        }
    });
}

async function updateBlacklistStats() {
    try {
        const stored = await chrome.storage.local.get(['blacklistFullDataByLevel']);
        const data = stored.blacklistFullDataByLevel;

        if (data && data.statistics) {
            document.getElementById('totalBlacklistedUsers').textContent = data.statistics.total_users_blacklisted || 0;
            document.getElementById('level1Users').textContent = data.statistics.users_in_level_1 || 0;
            document.getElementById('level2Users').textContent = data.statistics.users_in_level_2 || 0;
            document.getElementById('level3Users').textContent = data.statistics.users_in_level_3 || 0;
        } else {
            console.warn('[9GAG Bot Zapper Popup] Blacklist data or statistics not found in local storage.');
            document.getElementById('totalBlacklistedUsers').textContent = 'N/A';
            document.getElementById('level1Users').textContent = 'N/A';
            document.getElementById('level2Users').textContent = 'N/A';
            document.getElementById('level3Users').textContent = 'N/A';
        }
    } catch (error) {
        console.error('[9GAG Bot Zapper Popup] Error reading cached blacklist stats:', error);
        document.getElementById('totalBlacklistedUsers').textContent = 'Error';
        document.getElementById('level1Users').textContent = 'Error';
        document.getElementById('level2Users').textContent = 'Error';
        document.getElementById('level3Users').textContent = 'Error';
    }
}