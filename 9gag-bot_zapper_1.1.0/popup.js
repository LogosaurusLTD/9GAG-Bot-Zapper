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